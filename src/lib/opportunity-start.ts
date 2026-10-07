import {
  OPPORTUNITY_STAGES,
  RISK_LEVELS,
  STAGE_PLAYBOOK,
  WAITING_ON,
  accountFlag,
  addBusinessDays,
  todayInTimeZone,
} from "@/lib/domain";
import { actionError } from "@/lib/errors";
import { planInterestedOpportunityCreate } from "@/lib/opportunity-auto-create";
import { dateField, optionalNumber, optionalText, text } from "@/server/form";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/New_York";

type OpportunityWriteResult = { id: string } | { error: string };

export type AutoCreateInterestedResult = {
  created: boolean;
  id?: string;
  skipped?: string;
  error?: string;
};

async function businessTimezone(supabase: SupabaseClient) {
  const { data } = await supabase.from("app_settings").select("business_timezone").eq("id", 1).maybeSingle();
  const timezone = data && typeof data === "object" ? String((data as { business_timezone?: string | null }).business_timezone ?? "") : "";
  return timezone.trim() || DEFAULT_TIMEZONE;
}

export async function createOpportunityForLead(
  supabase: SupabaseClient,
  userId: string | null,
  leadId: string,
  formData: FormData,
): Promise<OpportunityWriteResult> {
  let loaded = await supabase.from("leads").select("id, company_id, contact_id, account_flag, archived_at, companies(name), contacts(first_name, last_name)").eq("id", leadId).maybeSingle();
  if (loaded.error && /archived_at/i.test(loaded.error.message ?? "")) {
    loaded = await supabase.from("leads").select("id, company_id, contact_id, account_flag, companies(name), contacts(first_name, last_name)").eq("id", leadId).maybeSingle();
  }
  if (loaded.error && /account_flag/i.test(loaded.error.message ?? "")) {
    loaded = await supabase.from("leads").select("id, company_id, contact_id, companies(name), contacts(first_name, last_name)").eq("id", leadId).maybeSingle();
  }
  if (loaded.error || !loaded.data) return { error: "That lead could not be found." };
  if ((loaded.data as { archived_at?: string | null }).archived_at) {
    return { error: "Restore this archived lead before starting a client journey." };
  }
  const lead = loaded.data;
  const record = lead as { company_id: string; contact_id: string; account_flag?: string | null; companies: { name: string } | { name: string }[] | null };
  const company = Array.isArray(record.companies) ? record.companies[0] : record.companies;
  const stage = text(formData, "stage") || "Interested";
  if (!(OPPORTUNITY_STAGES as readonly string[]).includes(stage)) return { error: "Choose a pipeline stage." };
  if (stage === "Client Started" || stage === "Won" || stage === "Lost") return { error: "Create the opportunity in an active stage, then record the outcome from the workspace." };
  const nextAction = text(formData, "next_action");
  const nextActionDate = dateField(formData, "next_action_date");
  if (!nextAction || !nextActionDate) return { error: "Every opportunity needs a next action and a due date." };
  const headcount = optionalNumber(formData, "headcount");
  const billingRate = optionalNumber(formData, "billing_rate");
  if (Number.isNaN(headcount) || Number.isNaN(billingRate)) return { error: "Headcount must be a number." };
  const nurture = stage === "On Hold / Nurture";
  const { data, error: insertError } = await supabase
    .from("opportunities")
    .insert({
      lead_id: leadId,
      company_id: record.company_id,
      contact_id: record.contact_id,
      owner_id: userId,
      title: `${company?.name ?? "Opportunity"} — virtual staff`,
      stage,
      status: nurture ? "nurture" : "active",
      risk_level: (RISK_LEVELS as readonly string[]).includes(text(formData, "risk_level")) ? text(formData, "risk_level") : "low",
      waiting_on: (WAITING_ON as readonly string[]).includes(text(formData, "waiting_on")) ? text(formData, "waiting_on") : "internal",
      next_action: nextAction,
      next_action_date: nextActionDate,
      headcount,
      billing_rate: billingRate,
      nurture_reason: optionalText(formData, "nurture_reason"),
      nurture_notes: optionalText(formData, "nurture_notes"),
      notes: optionalText(formData, "notes"),
    })
    .select("id")
    .single();
  if (insertError || !data) return { error: actionError(insertError) };
  const opportunityId = String((data as { id: string }).id);
  const inheritedFlag = accountFlag(record.account_flag);
  if (inheritedFlag) {
    await supabase.from("opportunities").update({ account_flag: inheritedFlag }).eq("id", opportunityId);
  }
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    company_id: record.company_id,
    contact_id: record.contact_id,
    type: "opportunity_created",
    title: "Opportunity created",
    actor_id: userId,
  });
  if (nurture) {
    await supabase.from("follow_ups").insert({
      opportunity_id: opportunityId,
      lead_id: leadId,
      owner_id: userId,
      title: nextAction,
      due_on: nextActionDate,
      reason: optionalText(formData, "nurture_reason"),
      notes: optionalText(formData, "nurture_notes"),
    });
    await supabase.from("activities").insert({
      opportunity_id: opportunityId,
      lead_id: leadId,
      type: "follow_up_created",
      title: "Nurture follow-up created",
      body: optionalText(formData, "nurture_notes"),
      actor_id: userId,
    });
  }
  return { id: opportunityId };
}

export async function startOpportunityForLead(
  supabase: SupabaseClient,
  userId: string | null,
  leadId: string,
): Promise<OpportunityWriteResult> {
  const timezone = await businessTimezone(supabase);
  const formData = new FormData();
  formData.set("stage", "Interested");
  formData.set("next_action", STAGE_PLAYBOOK.Interested.nextAction);
  formData.set("waiting_on", STAGE_PLAYBOOK.Interested.waitingOn);
  formData.set("next_action_date", addBusinessDays(todayInTimeZone(timezone), 2));
  return createOpportunityForLead(supabase, userId, leadId, formData);
}

export async function maybeAutoCreateInterestedOpportunity(
  supabase: SupabaseClient,
  userId: string | null,
  leadId: string,
  options: { possibleDuplicate?: boolean } = {},
): Promise<AutoCreateInterestedResult> {
  let loaded = await supabase.from("leads").select("id, sendpilot_status, archived_at").eq("id", leadId).maybeSingle();
  if (loaded.error && /archived_at/i.test(loaded.error.message ?? "")) {
    loaded = await supabase.from("leads").select("id, sendpilot_status").eq("id", leadId).maybeSingle();
  }
  if (loaded.error || !loaded.data) return { created: false, error: "That lead could not be found." };
  const opportunities = await supabase.from("opportunities").select("id").eq("lead_id", leadId);
  if (opportunities.error) return { created: false, error: actionError(opportunities.error) };
  const existingOpportunityCount = Array.isArray(opportunities.data) ? opportunities.data.length : opportunities.data ? 1 : 0;
  const plan = planInterestedOpportunityCreate({
    sendpilotStatus: loaded.data.sendpilot_status ? String(loaded.data.sendpilot_status) : null,
    archived: Boolean((loaded.data as { archived_at?: string | null }).archived_at),
    existingOpportunityCount,
    possibleDuplicate: options.possibleDuplicate,
  });
  if (plan.action === "skip") return { created: false, skipped: plan.reason };
  const created = await startOpportunityForLead(supabase, userId, leadId);
  if ("error" in created) {
    if (/already exists|duplicate/i.test(created.error)) return { created: false, skipped: "duplicate" };
    return { created: false, error: created.error };
  }
  return { created: true, id: created.id };
}

export async function backfillMissingInterestedOpportunities(
  supabase: SupabaseClient,
  userId: string | null,
  limit = 100,
) {
  let loaded = await supabase
    .from("leads")
    .select("id, sendpilot_status, archived_at")
    .eq("sendpilot_status", "Interested")
    .is("archived_at", null)
    .limit(limit);
  if (loaded.error && /archived_at/i.test(loaded.error.message ?? "")) {
    loaded = await supabase.from("leads").select("id, sendpilot_status").eq("sendpilot_status", "Interested").limit(limit);
  }
  if (loaded.error || !loaded.data?.length) return { created: 0 };
  const leads = loaded.data as Array<{ id: string; sendpilot_status: string | null; archived_at?: string | null }>;
  const ids = leads.map((lead) => lead.id);
  const opportunities = await supabase.from("opportunities").select("lead_id").in("lead_id", ids);
  const withOpportunity = new Set(
    (opportunities.data ?? []).map((row) => String((row as { lead_id: string }).lead_id)),
  );
  let created = 0;
  for (const lead of leads) {
    const plan = planInterestedOpportunityCreate({
      sendpilotStatus: lead.sendpilot_status,
      archived: Boolean(lead.archived_at),
      existingOpportunityCount: withOpportunity.has(lead.id) ? 1 : 0,
    });
    if (plan.action !== "create") continue;
    const started = await startOpportunityForLead(supabase, userId, lead.id);
    if ("id" in started) {
      created += 1;
      withOpportunity.add(lead.id);
    }
  }
  return { created };
}
