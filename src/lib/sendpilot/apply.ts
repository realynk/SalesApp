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
};

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
    .select("id, contact_id, company_id, sendpilot_status, sendpilot_status_raw")
    .eq("sendpilot_lead_id", sendpilotLeadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    leadId: String(data.id),
    contactId: String(data.contact_id),
    companyId: String(data.company_id),
    sendpilotStatus: data.sendpilot_status ? String(data.sendpilot_status) : null,
    sendpilotStatusRaw: data.sendpilot_status_raw ? String(data.sendpilot_status_raw) : null,
  };
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
    .select("id, contact_id, company_id, sendpilot_status, sendpilot_status_raw")
    .eq("id", data.matched_lead_id)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return null;
  return {
    leadId: String(lead.id),
    contactId: String(lead.contact_id),
    companyId: String(lead.company_id),
    sendpilotStatus: lead.sendpilot_status ? String(lead.sendpilot_status) : null,
    sendpilotStatusRaw: lead.sendpilot_status_raw ? String(lead.sendpilot_status_raw) : null,
  };
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
    .select("id, contact_id, company_id, sendpilot_status, sendpilot_status_raw")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    leadId: String(data.id),
    contactId: String(data.contact_id),
    companyId: String(data.company_id),
    sendpilotStatus: data.sendpilot_status ? String(data.sendpilot_status) : null,
    sendpilotStatusRaw: data.sendpilot_status_raw ? String(data.sendpilot_status_raw) : null,
  };
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

  if (linkedinContacts.length > 1 || emailContacts.length > 1) {
    return { match: null, classification: "possible_duplicate", reviewReason: "Multiple contacts share this SendPilot LinkedIn URL or email." };
  }

  if (linkedinContacts.length === 1 && emailContacts.length === 1 && linkedinContacts[0].id !== emailContacts[0].id) {
    return { match: null, classification: "possible_duplicate", reviewReason: "LinkedIn URL and email match different contacts." };
  }

  const contact = linkedinContacts[0] ?? emailContacts[0];
  if (contact) {
    const lead = await leadForContact(supabase, String(contact.id));
    if (lead) return { match: lead, classification: "existing", reviewReason: null };
    return {
      match: {
        leadId: "",
        contactId: String(contact.id),
        companyId: String(contact.company_id),
        sendpilotStatus: null,
        sendpilotStatusRaw: null,
      },
      classification: "existing_contact",
      reviewReason: null,
    };
  }

  return { match: null, classification: "unmatched", reviewReason: null };
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
  const firstName = input.ids.firstName || input.apiLead?.firstName || "Unknown";
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
    .select("id, contact_id, company_id, sendpilot_status, sendpilot_status_raw")
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
  if (input.sendpilotStatus === "Interested") {
    await supabase.from("activities").insert({
      lead_id: leadInsert.data.id,
      contact_id: contactId,
      company_id: companyId,
      type: "lead_became_interested",
      title: ACTIVITY_LABELS.lead_became_interested,
      metadata: { source: "webhook" },
    });
  }
  return {
    leadId: String(leadInsert.data.id),
    contactId,
    companyId,
    sendpilotStatus: leadInsert.data.sendpilot_status ? String(leadInsert.data.sendpilot_status) : null,
    sendpilotStatusRaw: leadInsert.data.sendpilot_status_raw ? String(leadInsert.data.sendpilot_status_raw) : null,
  };
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
    .select("id, contact_id, company_id, sendpilot_status, sendpilot_status_raw")
    .single();
  if (leadInsert.error || !leadInsert.data) throw leadInsert.error ?? new Error("Could not create lead for existing contact.");
  return {
    leadId: String(leadInsert.data.id),
    contactId: String(leadInsert.data.contact_id),
    companyId: String(leadInsert.data.company_id),
    sendpilotStatus: leadInsert.data.sendpilot_status ? String(leadInsert.data.sendpilot_status) : null,
    sendpilotStatusRaw: leadInsert.data.sendpilot_status_raw ? String(leadInsert.data.sendpilot_status_raw) : null,
  };
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
    if (!lead) {
      if (!ids.linkedinUrl && !ids.email) {
        await writeSyncAndRecord(supabase, {
          eventType,
          eventId,
          ids,
          classification: "unmatched",
          reviewRequired: true,
          reviewReason: "No matching SalesApp lead was found.",
          leadId: null,
          contactId: null,
          raw: envelope.data,
          counts: { newRecords: 0, updatedRecords: 0, unmatchedRecords: 1, possibleDuplicates: 0 },
        });
        await finishEvent(supabase, {
          eventId,
          status: "ignored",
          result: { reason: "unmatched" },
        });
        console.info("[sendpilot.webhook]", { eventId, eventType, outcome: "unmatched" });
        return { httpStatus: 200, body: { ok: true, unmatched: true, eventId, eventType } };
      }
      lead = await createLeadFromWebhook(supabase, {
        ids,
        apiLead,
        sendpilotStatus: status.applyNormalized ? status.normalized : null,
        sendpilotStatusRaw: status.raw,
      });
      created = true;
    } else if (!lead.leadId) {
      lead = await ensureLeadForContact(
        supabase,
        lead,
        ids,
        status.applyNormalized ? status.normalized : null,
        status.raw,
      );
      created = true;
    }

    const previousStatus = lead.sendpilotStatus;
    const leadUpdate: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      sendpilot_lead_id: ids.leadId || undefined,
    };
    if (status.raw) leadUpdate.sendpilot_status_raw = status.raw;
    if (status.applyNormalized) leadUpdate.sendpilot_status = status.normalized;

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
    } else if (status.applyNormalized && status.normalized !== previousStatus) {
      activityType = status.normalized === "Interested" && previousStatus !== "Interested"
        ? "lead_became_interested"
        : "sendpilot_status_changed";
      await recordActivity(supabase, {
        eventId,
        lead,
        type: activityType,
        title: activityType === "lead_became_interested" ? ACTIVITY_LABELS.lead_became_interested : "SendPilot status changed",
        body: [previousStatus, status.normalized || status.raw].filter(Boolean).join(" → "),
        metadata: { sendpilotLeadId: ids.leadId, previousStatus, newStatus: status.normalized || status.raw },
      });
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
