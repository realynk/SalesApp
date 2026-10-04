import { createHash } from "node:crypto";
import {
  ACTIVITY_LABELS,
  normalizeEmail,
  normalizeLinkedIn,
  normalizeName,
  type ActivityType,
} from "@/lib/domain";
import { loadSendPilotLead, type SendPilotLead } from "@/lib/sendpilot/client";
import { isSendPilotApiConfigured } from "@/lib/sendpilot/config";
import {
  extractSendPilotIdentifiers,
  isSupportedSendPilotEvent,
  parseSendPilotEnvelope,
  resolveSendPilotSourceStatus,
  type SendPilotWebhookIdentifiers,
} from "@/lib/sendpilot/events";
import {
  classifyWebhookIdentityMatch,
  createdWebhookStatusActivity,
  shouldCreateUnmatchedWebhookLead,
  webhookLeadUpdate,
  webhookStatusActivity,
} from "@/lib/sendpilot/webhook";
import { identitiesOverlap } from "./suppress";
import { createAdminClient, supabaseServiceRoleKey } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type ApplyResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type MatchedLead = {
  leadId: string;
  contactId: string;
  companyId: string;
  sendpilotStatus: string | null;
  sendpilotStatusRaw: string | null;
  sendpilotLeadId: string | null;
  archived: boolean;
};

const LEAD_MATCH_SELECT =
  "id, contact_id, company_id, sendpilot_status, sendpilot_status_raw, sendpilot_lead_id, archived_at";

function matchedFromRow(data: {
  id: unknown;
  contact_id: unknown;
  company_id: unknown;
  sendpilot_status: unknown;
  sendpilot_status_raw: unknown;
  sendpilot_lead_id?: unknown;
  archived_at: unknown;
}): MatchedLead {
  return {
    leadId: String(data.id),
    contactId: String(data.contact_id),
    companyId: String(data.company_id),
    sendpilotStatus: data.sendpilot_status ? String(data.sendpilot_status) : null,
    sendpilotStatusRaw: data.sendpilot_status_raw ? String(data.sendpilot_status_raw) : null,
    sendpilotLeadId: data.sendpilot_lead_id ? String(data.sendpilot_lead_id) : null,
    archived: Boolean(data.archived_at),
  };
}

function asErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return error instanceof Error ? error.message : "unknown_error";
}

function eventKey(eventId: string | null, rawBody: string) {
  if (eventId) return eventId;
  return `hash_${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`;
}

async function claimEvent(
  supabase: SupabaseClient,
  input: { eventId: string; eventType: string; payload: unknown },
): Promise<"process" | "duplicate"> {
  const inserted = await supabase.from("sendpilot_webhook_events").insert({
    event_id: input.eventId,
    event_type: input.eventType,
    payload: input.payload ?? {},
    status: "ignored",
    result: { phase: "received" },
  });
  if (!inserted.error) return "process";
  if (inserted.error.code !== "23505") throw inserted.error;

  const existing = await supabase
    .from("sendpilot_webhook_events")
    .select("status")
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (existing.data?.status === "failed") return "process";
  return "duplicate";
}

async function finishEvent(
  supabase: SupabaseClient,
  input: {
    eventId: string;
    status: "applied" | "ignored" | "failed";
    leadId?: string | null;
    result: Record<string, unknown>;
    error?: string | null;
  },
) {
  await supabase
    .from("sendpilot_webhook_events")
    .update({
      status: input.status,
      lead_id: input.leadId ?? null,
      result: input.result,
      error: input.error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", input.eventId);
}

async function leadBySendPilotId(supabase: SupabaseClient, sendpilotLeadId: string): Promise<MatchedLead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_MATCH_SELECT)
    .eq("sendpilot_lead_id", sendpilotLeadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return matchedFromRow(data);
}

async function leadByExternalRecord(supabase: SupabaseClient, sendpilotLeadId: string): Promise<MatchedLead | null> {
  const { data, error } = await supabase
    .from("sendpilot_records")
    .select("matched_lead_id")
    .eq("external_id", sendpilotLeadId)
    .not("matched_lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.matched_lead_id) return null;
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(LEAD_MATCH_SELECT)
    .eq("id", data.matched_lead_id)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return null;
  return matchedFromRow(lead);
}

async function contactsByKey(
  supabase: SupabaseClient,
  column: "linkedin_key" | "email_key",
  value: string,
) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, company_id, first_name, last_name, email, linkedin_url")
    .eq(column, value)
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

async function leadForContact(supabase: SupabaseClient, contactId: string): Promise<MatchedLead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_MATCH_SELECT)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return matchedFromRow(data);
}

async function matchLead(
  supabase: SupabaseClient,
  ids: SendPilotWebhookIdentifiers,
): Promise<{ match: MatchedLead | null; classification: string; reviewReason: string | null }> {
  if (ids.leadId) {
    const byId = (await leadBySendPilotId(supabase, ids.leadId)) ?? (await leadByExternalRecord(supabase, ids.leadId));
    if (byId) return { match: byId, classification: "existing", reviewReason: null };
  }

  const linkedinKey = normalizeLinkedIn(ids.linkedinUrl);
  const emailKey = normalizeEmail(ids.email);
  const linkedinContacts = linkedinKey ? await contactsByKey(supabase, "linkedin_key", linkedinKey) : [];
  const emailContacts = emailKey ? await contactsByKey(supabase, "email_key", emailKey) : [];
  const identity = classifyWebhookIdentityMatch(linkedinContacts, emailContacts);
  if (identity.classification === "possible_duplicate") {
    return { match: null, classification: "possible_duplicate", reviewReason: identity.reviewReason };
  }
  if (identity.classification === "unmatched") {
    return { match: null, classification: "unmatched", reviewReason: null };
  }

  const contact = identity.contact;
  const lead = await leadForContact(supabase, String(contact.id));
  if (lead) return { match: lead, classification: "existing", reviewReason: null };
  return {
    match: {
      leadId: "",
      contactId: String(contact.id),
      companyId: String(contact.company_id),
      sendpilotStatus: null,
      sendpilotStatusRaw: null,
      sendpilotLeadId: null,
      archived: false,
    },
    classification: "existing_contact",
    reviewReason: null,
  };
}

async function findActiveSuppression(supabase: SupabaseClient, ids: SendPilotWebhookIdentifiers) {
  const rows: Array<{ sendpilot_lead_id: string | null; email: string | null; linkedin_url: string | null }> = [];
  if (ids.leadId) {
    const byId = await supabase.from("sendpilot_suppressions").select("sendpilot_lead_id, email, linkedin_url").is("released_at", null).eq("sendpilot_lead_id", ids.leadId).limit(5);
    if (byId.data) rows.push(...byId.data);
  }
  const emailKey = normalizeEmail(ids.email);
  if (emailKey) {
    const byEmail = await supabase.from("sendpilot_suppressions").select("sendpilot_lead_id, email, linkedin_url").is("released_at", null).eq("email_key", emailKey).limit(5);
    if (byEmail.data) rows.push(...byEmail.data);
  }
  const linkedinKey = normalizeLinkedIn(ids.linkedinUrl);
  if (linkedinKey) {
    const byLinkedin = await supabase.from("sendpilot_suppressions").select("sendpilot_lead_id, email, linkedin_url").is("released_at", null).eq("linkedin_key", linkedinKey).limit(5);
    if (byLinkedin.data) rows.push(...byLinkedin.data);
  }
  return rows.some((row) => identitiesOverlap(ids, { sendpilotLeadId: row.sendpilot_lead_id, email: row.email, linkedinUrl: row.linkedin_url }));
}

async function findOrCreateCompany(supabase: SupabaseClient, companyName: string) {
  const name = companyName.trim() || "Unknown company";
  const key = normalizeName(name);
  if (key) {
    const existing = await supabase.from("companies").select("id").eq("name_key", key).maybeSingle();
    if (existing.data?.id) return String(existing.data.id);
  }
  const inserted = await supabase.from("companies").insert({ name }).select("id").single();
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Could not create company.");
  return String(inserted.data.id);
}

async function createLeadFromWebhook(
  supabase: SupabaseClient,
  input: {
    ids: SendPilotWebhookIdentifiers;
    apiLead: SendPilotLead | null;
    sendpilotStatus: string | null;
    sendpilotStatusRaw: string | null;
  },
): Promise<MatchedLead> {
  const firstName = input.ids.firstName || input.apiLead?.firstName || "";
  const lastName = input.ids.lastName || input.apiLead?.lastName || "";
  const companyId = await findOrCreateCompany(supabase, input.ids.company || input.apiLead?.company || "Unknown company");
  const contactInsert = await supabase
    .from("contacts")
    .insert({
      company_id: companyId,
      first_name: firstName,
      last_name: lastName,
      email: input.ids.email || input.apiLead?.email || null,
      linkedin_url: input.ids.linkedinUrl || input.apiLead?.linkedinUrl || null,
      title: input.ids.title || input.apiLead?.title || null,
    })
    .select("id")
    .single();
  if (contactInsert.error || !contactInsert.data) throw contactInsert.error ?? new Error("Could not create contact.");
  const contactId = String(contactInsert.data.id);
  const leadInsert = await supabase
    .from("leads")
    .insert({
      contact_id: contactId,
      company_id: companyId,
      source: "sendpilot",
      sendpilot_lead_id: input.ids.leadId,
      sendpilot_status: input.sendpilotStatus,
      sendpilot_status_raw: input.sendpilotStatusRaw,
      last_synced_at: new Date().toISOString(),
    })
    .select(LEAD_MATCH_SELECT)
    .single();
  if (leadInsert.error || !leadInsert.data) throw leadInsert.error ?? new Error("Could not create lead.");
  await supabase.from("activities").insert({
    lead_id: leadInsert.data.id,
    contact_id: contactId,
    company_id: companyId,
    type: "lead_imported",
    title: "Lead imported from SendPilot webhook",
    metadata: { source: "webhook" },
  });
  return matchedFromRow(leadInsert.data);
}

async function ensureLeadForContact(
  supabase: SupabaseClient,
  match: MatchedLead,
  ids: SendPilotWebhookIdentifiers,
  sendpilotStatus: string | null,
  sendpilotStatusRaw: string | null,
): Promise<MatchedLead> {
  if (match.leadId) return match;
  const leadInsert = await supabase
    .from("leads")
    .insert({
      contact_id: match.contactId,
      company_id: match.companyId,
      source: "sendpilot",
      sendpilot_lead_id: ids.leadId,
      sendpilot_status: sendpilotStatus,
      sendpilot_status_raw: sendpilotStatusRaw,
      last_synced_at: new Date().toISOString(),
    })
    .select(LEAD_MATCH_SELECT)
    .single();
  if (leadInsert.error || !leadInsert.data) throw leadInsert.error ?? new Error("Could not create lead for existing contact.");
  return matchedFromRow(leadInsert.data);
}

async function ignoreAsUnmatched(
  supabase: SupabaseClient,
  input: {
    eventType: string;
    eventId: string;
    ids: SendPilotWebhookIdentifiers;
    contactId: string | null;
    raw: unknown;
  },
) {
  await writeSyncAndRecord(supabase, {
    eventType: input.eventType,
    eventId: input.eventId,
    ids: input.ids,
    classification: "unmatched",
    reviewRequired: true,
    reviewReason: "No matching SalesApp lead was found.",
    leadId: null,
    contactId: input.contactId,
    raw: input.raw,
    counts: { newRecords: 0, updatedRecords: 0, unmatchedRecords: 1, possibleDuplicates: 0 },
  });
  await finishEvent(supabase, {
    eventId: input.eventId,
    status: "ignored",
    result: { reason: "unmatched" },
  });
  console.info("[sendpilot.webhook]", { eventId: input.eventId, eventType: input.eventType, outcome: "unmatched" });
}

async function recordActivity(
  supabase: SupabaseClient,
  input: {
    eventId: string;
    lead: MatchedLead;
    type: ActivityType;
    title: string;
    body?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const existing = await supabase
    .from("activities")
    .select("id")
    .eq("lead_id", input.lead.leadId)
    .contains("metadata", { sendpilotEventId: input.eventId, type: input.type })
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return;
  await supabase.from("activities").insert({
    lead_id: input.lead.leadId,
    contact_id: input.lead.contactId,
    company_id: input.lead.companyId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    metadata: { sendpilotEventId: input.eventId, type: input.type, source: "webhook", ...(input.metadata ?? {}) },
  });
}

async function writeSyncAndRecord(
  supabase: SupabaseClient,
  input: {
    eventType: string;
    eventId: string;
    ids: SendPilotWebhookIdentifiers;
    classification: string;
    reviewRequired: boolean;
    reviewReason: string | null;
    leadId: string | null;
    contactId: string | null;
    raw: unknown;
    counts: { newRecords: number; updatedRecords: number; unmatchedRecords: number; possibleDuplicates: number };
  },
) {
  const sync = await supabase
    .from("sendpilot_syncs")
    .insert({
      source: "webhook",
      filename: input.eventType,
      status: "applied",
      completed_at: new Date().toISOString(),
      total_records: 1,
      new_records: input.counts.newRecords,
      existing_records: input.leadId && !input.counts.newRecords ? 1 : 0,
      updated_records: input.counts.updatedRecords,
      matched_records: input.leadId ? 1 : 0,
      possible_duplicates: input.counts.possibleDuplicates,
      unmatched_records: input.counts.unmatchedRecords,
      review_records: input.reviewRequired ? 1 : 0,
    })
    .select("id")
    .single();
  if (sync.error || !sync.data) throw sync.error ?? new Error("Could not record SendPilot sync.");
  await supabase.from("sendpilot_records").insert({
    sync_id: sync.data.id,
    external_id: input.ids.leadId,
    raw: input.raw ?? {},
    full_name: [input.ids.firstName, input.ids.lastName].filter(Boolean).join(" "),
    first_name: input.ids.firstName,
    last_name: input.ids.lastName,
    company_name: input.ids.company,
    email: input.ids.email,
    linkedin_url: input.ids.linkedinUrl,
    sendpilot_status: input.ids.customLeadStatus || input.ids.newStatus || input.ids.tags.join(", ") || null,
    source: "webhook",
    classification: input.classification,
    review_required: input.reviewRequired,
    review_reason: input.reviewReason,
    matched_contact_id: input.contactId,
    matched_lead_id: input.leadId,
    applied: Boolean(input.leadId) && !input.reviewRequired,
  });
}

export async function applySendPilotWebhook(rawBody: string): Promise<ApplyResult> {
  if (!supabaseServiceRoleKey()) {
    return {
      httpStatus: 503,
      body: { error: "SendPilot webhooks need a server-only Supabase service role key to write under RLS." },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, body: { error: "Webhook body must be JSON." } };
  }

  const envelope = parseSendPilotEnvelope(payload);
  if (!envelope) return { httpStatus: 400, body: { error: "Webhook envelope is invalid." } };

  const eventId = eventKey(envelope.eventId, rawBody);
  const eventType = envelope.eventType;
  const supabase = createAdminClient();

  const claim = await claimEvent(supabase, { eventId, eventType: eventType || "unknown", payload });
  if (claim === "duplicate") {
    console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "duplicate" });
    return { httpStatus: 200, body: { ok: true, duplicate: true, eventId, eventType } };
  }

  try {
    if (!isSupportedSendPilotEvent(eventType)) {
      await finishEvent(supabase, {
        eventId,
        status: "ignored",
        result: { reason: "unsupported_event" },
      });
      console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "ignored" });
      return { httpStatus: 200, body: { ok: true, ignored: true, eventId, eventType } };
    }

    const payloadIds = extractSendPilotIdentifiers(envelope.data);
    let apiLead: SendPilotLead | null = null;
    if (payloadIds.leadId && isSendPilotApiConfigured()) {
      try {
        apiLead = await loadSendPilotLead(payloadIds.leadId, payloadIds.campaignId);
      } catch (error) {
        console.error("[sendpilot.webhook]", {
          eventId,
          eventType,
          outcome: "api_lookup_failed",
          error: asErrorMessage(error),
        });
      }
    } else if (payloadIds.leadId && !isSendPilotApiConfigured()) {
      console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "api_not_configured" });
    }

    const ids: SendPilotWebhookIdentifiers = {
      leadId: payloadIds.leadId || apiLead?.id || null,
      campaignId: payloadIds.campaignId || apiLead?.campaignId || null,
      linkedinUrl: payloadIds.linkedinUrl || apiLead?.linkedinUrl || null,
      email: payloadIds.email || apiLead?.email || null,
      firstName: payloadIds.firstName || apiLead?.firstName || null,
      lastName: payloadIds.lastName || apiLead?.lastName || null,
      company: payloadIds.company || apiLead?.company || null,
      title: payloadIds.title || apiLead?.title || null,
      customLeadStatus: payloadIds.customLeadStatus || apiLead?.customLeadStatus || null,
      newTag: payloadIds.newTag,
      previousTag: payloadIds.previousTag,
      newStatus: payloadIds.newStatus,
      previousStatus: payloadIds.previousStatus,
      reply: payloadIds.reply,
      tags: payloadIds.tags,
    };

    if (!ids.leadId && !ids.linkedinUrl && !ids.email) {
      await finishEvent(supabase, {
        eventId,
        status: "ignored",
        result: { reason: "missing_identifiers" },
      });
      console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "missing_identifiers" });
      return { httpStatus: 200, body: { ok: true, ignored: true, reason: "missing_identifiers", eventId, eventType } };
    }

    const status = resolveSendPilotSourceStatus({
      eventType,
      customLeadStatus: payloadIds.customLeadStatus,
      tags: ids.tags,
      newTag: payloadIds.newTag,
      previousTag: payloadIds.previousTag,
      newStatus: ids.newStatus,
      apiCustomLeadStatus: apiLead?.customLeadStatus,
      apiStatus: apiLead?.status,
    });

    const matched = await matchLead(supabase, ids);
    if (matched.classification === "possible_duplicate") {
      await writeSyncAndRecord(supabase, {
        eventType,
        eventId,
        ids,
        classification: "possible_duplicate",
        reviewRequired: true,
        reviewReason: matched.reviewReason,
        leadId: null,
        contactId: null,
        raw: envelope.data,
        counts: { newRecords: 0, updatedRecords: 0, unmatchedRecords: 0, possibleDuplicates: 1 },
      });
      await finishEvent(supabase, {
        eventId,
        status: "ignored",
        result: { reason: "possible_duplicate" },
      });
      console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "possible_duplicate" });
      return { httpStatus: 200, body: { ok: true, review: true, reason: "possible_duplicate", eventId, eventType } };
    }

    let created = false;
    let lead = matched.match;
    const suppressed = !lead?.leadId ? await findActiveSuppression(supabase, ids) : false;
    if (suppressed) {
      await writeSyncAndRecord(supabase, {
        eventType,
        eventId,
        ids,
        classification: "suppressed",
        reviewRequired: true,
        reviewReason: "This SendPilot lead was permanently deleted. Recreate it only from import review.",
        leadId: null,
        contactId: lead?.contactId ?? null,
        raw: envelope.data,
        counts: { newRecords: 0, updatedRecords: 0, unmatchedRecords: 0, possibleDuplicates: 0 },
      });
      await finishEvent(supabase, {
        eventId,
        status: "ignored",
        result: { reason: "suppressed" },
      });
      console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "suppressed" });
      return { httpStatus: 200, body: { ok: true, suppressed: true, eventId, eventType } };
    }
    if (!lead?.leadId) {
      const canCreate = shouldCreateUnmatchedWebhookLead({
        hasExistingLead: false,
        possibleDuplicate: false,
        suppressed: false,
        applyNormalized: status.applyNormalized,
        normalized: status.normalized,
        sendpilotLeadId: ids.leadId,
        email: ids.email,
        linkedinUrl: ids.linkedinUrl,
      });
      if (!canCreate) {
        await ignoreAsUnmatched(supabase, {
          eventType,
          eventId,
          ids,
          contactId: lead?.contactId ?? null,
          raw: envelope.data,
        });
        return { httpStatus: 200, body: { ok: true, unmatched: true, eventId, eventType } };
      }
      if (!lead) {
        lead = await createLeadFromWebhook(supabase, {
          ids,
          apiLead,
          sendpilotStatus: status.applyNormalized ? status.normalized : null,
          sendpilotStatusRaw: status.raw,
        });
      } else {
        lead = await ensureLeadForContact(
          supabase,
          lead,
          ids,
          status.applyNormalized ? status.normalized : null,
          status.raw,
        );
      }
      created = true;
    }

    const previousStatus = created ? null : lead.sendpilotStatus;
    const leadUpdate = webhookLeadUpdate({
      existingSendpilotLeadId: lead.sendpilotLeadId,
      incomingLeadId: ids.leadId,
      status,
      nowIso: new Date().toISOString(),
    });
    // Archived leads stay archived. Webhooks never clear archived_at.

    const { error: updateError } = await supabase.from("leads").update(leadUpdate).eq("id", lead.leadId);
    if (updateError) throw updateError;

    if (ids.email || ids.linkedinUrl || ids.title) {
      const current = await supabase
        .from("contacts")
        .select("email, linkedin_url, title")
        .eq("id", lead.contactId)
        .maybeSingle();
      const next: Record<string, unknown> = {};
      if (!current.data?.email && ids.email) next.email = ids.email;
      if (!current.data?.linkedin_url && ids.linkedinUrl) next.linkedin_url = ids.linkedinUrl;
      if (!current.data?.title && ids.title) next.title = ids.title;
      if (Object.keys(next).length) {
        const patched = await supabase.from("contacts").update(next).eq("id", lead.contactId);
        if (patched.error) {
          console.error("[sendpilot.webhook]", {
            eventId,
            eventType,
            outcome: "contact_patch_skipped",
            error: patched.error.message,
          });
        }
      }
    }

    let activityType: ActivityType | null = null;
    if (eventType === "reply.received") {
      activityType = "email_received";
      await recordActivity(supabase, {
        eventId,
        lead,
        type: "email_received",
        title: "Reply received in SendPilot",
        body: ids.reply,
        metadata: { campaignId: ids.campaignId, sendpilotLeadId: ids.leadId },
      });
    } else if (created) {
      const createdStatus = status.applyNormalized ? status.normalized : null;
      activityType = createdWebhookStatusActivity(createdStatus);
      if (activityType && (createdStatus === "Interested" || createdStatus === "Not Interested")) {
        await recordActivity(supabase, {
          eventId,
          lead,
          type: activityType,
          title: activityType === "lead_became_interested" ? ACTIVITY_LABELS.lead_became_interested : "SendPilot status changed",
          body: [createdStatus].filter(Boolean).join(" → "),
          metadata: { sendpilotLeadId: ids.leadId, previousStatus: null, newStatus: createdStatus },
        });
      }
    } else {
      activityType = webhookStatusActivity({
        duplicateEvent: false,
        archived: lead.archived,
        applyNormalized: status.applyNormalized,
        previousStatus,
        nextStatus: status.applyNormalized ? status.normalized : null,
      });
      if (activityType) {
        await recordActivity(supabase, {
          eventId,
          lead,
          type: activityType,
          title: activityType === "lead_became_interested" ? ACTIVITY_LABELS.lead_became_interested : "SendPilot status changed",
          body: [previousStatus, status.normalized || status.raw].filter(Boolean).join(" → "),
          metadata: { sendpilotLeadId: ids.leadId, previousStatus, newStatus: status.normalized || status.raw },
        });
      }
    }

    await writeSyncAndRecord(supabase, {
      eventType,
      eventId,
      ids,
      classification: created ? "new" : "updated",
      reviewRequired: false,
      reviewReason: null,
      leadId: lead.leadId,
      contactId: lead.contactId,
      raw: envelope.data,
      counts: {
        newRecords: created ? 1 : 0,
        updatedRecords: created ? 0 : 1,
        unmatchedRecords: 0,
        possibleDuplicates: 0,
      },
    });

    await finishEvent(supabase, {
      eventId,
      status: "applied",
      leadId: lead.leadId,
      result: {
        matchedLeadId: lead.leadId,
        created,
        sendpilotStatus: status.applyNormalized ? status.normalized : previousStatus,
        opportunityStageUntouched: true,
        archived: lead.archived,
        activityType,
      },
    });

    console.info("[sendpilot.webhook]", {
      eventId,
      eventType,
      outcome: "applied",
      created,
      sendpilotLeadPresent: Boolean(ids.leadId),
    });
    return {
      httpStatus: 200,
      body: {
        ok: true,
        eventId,
        eventType,
        leadId: lead.leadId,
        created,
      },
    };
  } catch (error) {
    const message = asErrorMessage(error);
    console.error("[sendpilot.webhook]", { eventId, eventType, outcome: "failed", error: message });
    await finishEvent(supabase, {
      eventId,
      status: "failed",
      result: { reason: "handler_error" },
      error: message,
    });
    return { httpStatus: 500, body: { error: "SendPilot webhook could not be applied." } };
  }
}
