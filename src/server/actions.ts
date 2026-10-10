"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ACTIVITY_TYPES,
  CANDIDATE_STATUSES,
  CONTRACT_STATUSES,
  INTERVIEW_STATUSES,
  OPPORTUNITY_STAGES,
  RECRUITMENT_STATUSES,
  RISK_LEVELS,
  SENDPILOT_STATUSES,
  NOT_INTERESTED_INTAKE,
  NOT_INTERESTED_OUTCOMES,
  notInterestedOutcome,
  accountFlag,
  STAGE_PLAYBOOK,
  PROFILE_SEND_STAGE,
  BOOKED_CALL_STAGE,
  SALES_CALL_COMPLETE_STAGE,
  SALES_CALL_COMPLETE_TASKS,
  INTERVIEW_COMPLETE_STAGE,
  SOW_PREP_STAGE,
  LOST_REASONS,
  formatClock,
  WAITING_ON,
  dateInTimeZone,
  stageRequiresNextAction,
  type ActivityType,
  type OpportunityStage,
  normalizeEmail,
  normalizeLinkedIn,
} from "@/lib/domain";
import { importedSendPilotStatus, parseDuplicateTagging, taggingPatch } from "@/lib/sendpilot/review";
import { bulkReviewEligible } from "@/lib/review-origin";
import { actionError } from "@/lib/errors";
import {
  defaultRecruitmentTarget,
  leadHasResponded,
  planBookedCallTasks,
  planCandidateProfileFollowUp,
  planInterviewDay,
  planInterviewFeedback,
  planInterviewReview,
  planNurtureCheckIns,
  planRecruitmentProgress,
  planSalesCallCompleteTasks,
  planSalesProfileFollowUps,
  planSignedSowTasks,
  planSowConfirmStart,
  planSowSignature,
  planTrialPeriodTasks,
} from "@/lib/pipeline-automation";
import { resolvedProfileCount, writeFailureMessage } from "@/lib/migration-columns";
import { civilTimeInZoneToIso, todayInWorkflowZone } from "@/lib/workflow-dates";
import {
  afterFollowUpCompleted,
  cancelAutomationTypes,
  cancelTypesForStage,
  completeAutomationType,
  completeLinkedTaskRecords,
  opportunityLeadId,
  syncOpportunityNextAction,
  upsertAutomationTasks,
} from "@/server/pipeline-tasks";
import { buildTalentRequestEmail, type TalentFacts } from "@/lib/talent-request";
import {
  createOpportunityForLead,
  maybeAutoCreateInterestedOpportunity,
  startOpportunityForLead,
} from "@/lib/opportunity-start";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/auth/origin";
import {
  LOGIN_METHOD_COOKIE,
  LOGIN_METHOD_MAGIC,
  LOGIN_METHOD_PASSWORD,
  MAGIC_LINK_SENT,
  loginMethodCookieOptions,
  loginPathForMethod,
  magicLinkEmailRedirectTo,
  safeNextPath,
} from "@/lib/auth/passwordless";
import { createClient } from "@/lib/supabase/server";
import { dateField, optionalNumber, optionalText, settingsSchema, text, type ActionState } from "@/server/form";
import { requireUser, requireWriter } from "@/server/session";

function refresh(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

function isUuid(value: string) {
  return z.uuid().safeParse(value).success;
}

export async function signIn(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(8).max(200) }).safeParse({
    email: text(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: "Enter the email and password for your Realynk account." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Those credentials were not accepted." };
  const cookieStore = await cookies();
  cookieStore.set(LOGIN_METHOD_COOKIE, LOGIN_METHOD_PASSWORD, loginMethodCookieOptions);
  const next = text(formData, "next");
  redirect(safeNextPath(next));
}

export async function requestExecutiveMagicLink(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.email() }).safeParse({ email: text(formData, "email") });
  if (!parsed.success) return { error: "Enter the authorized Executive email." };
  const origin = await appOrigin();
  if (!origin) return { error: "The sign-in link could not be prepared. Try again from the SalesApp address." };
  const supabase = await createClient();
  const cookieStore = await cookies();
  cookieStore.set(LOGIN_METHOD_COOKIE, LOGIN_METHOD_MAGIC, loginMethodCookieOptions);
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: magicLinkEmailRedirectTo(origin, text(formData, "next")),
    },
  });
  return { success: MAGIC_LINK_SENT };
}

export async function signOut() {
  const cookieStore = await cookies();
  const method = cookieStore.get(LOGIN_METHOD_COOKIE)?.value;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(loginPathForMethod(method));
}

export async function updateProfile(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const fullName = text(formData, "full_name");
  if (fullName.length < 2) return { error: "Enter your name." };
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) return { error: actionError(error) };
  refresh("/settings", "/dashboard");
  return { success: "Profile saved." };
}

export async function saveSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const parsed = settingsSchema.safeParse({
    stale_after_days: text(formData, "stale_after_days"),
    profiles_waiting_days: text(formData, "profiles_waiting_days"),
    recruitment_target_business_days: text(formData, "recruitment_target_business_days"),
    approaching_window_days: text(formData, "approaching_window_days"),
    business_timezone: text(formData, "business_timezone"),
  });
  if (!parsed.success) return { error: "Check the thresholds. Stale days must be between 1 and 180." };
  const { error } = await supabase.from("app_settings").update({ ...parsed.data, updated_by: userId }).eq("id", 1);
  if (error) return { error: actionError(error) };
  refresh("/settings", "/dashboard", "/notifications");
  return { success: "Settings saved." };
}

export async function loadSampleWorkspace(): Promise<void> {
  const { supabase } = await requireWriter();
  const { error } = await supabase.rpc("load_sample_workspace");
  if (error) redirect(`/dashboard?notice=${encodeURIComponent(actionError(error))}`);
  refresh("/dashboard", "/leads", "/opportunities", "/reconciliation", "/recruitment", "/reporting", "/follow-ups");
  redirect("/dashboard");
}

export async function createLead(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const companyName = text(formData, "company");
  const email = text(formData, "email").toLowerCase();
  const linkedin = optionalText(formData, "linkedin_url");
  const phone = optionalText(formData, "phone");
  const source = optionalText(formData, "source") ?? "manual";
  const status = text(formData, "sendpilot_status");
  if (!firstName || !companyName) return { error: "First name and company are required." };
  if (email) {
    const { data: existing } = await supabase.from("contacts").select("id").eq("email_key", email).maybeSingle();
    if (existing) return { error: "A contact with that email already exists. Open the existing lead instead of creating a duplicate." };
    const { data: suppressed } = await supabase.from("sendpilot_suppressions").select("id").is("released_at", null).eq("email_key", email).maybeSingle();
    if (suppressed) return { error: "That email belongs to a permanently deleted SendPilot lead. Recreate it from Lead review, not from this form." };
  }
  const { data: company, error: companyError } = await supabase.from("companies").insert({ name: companyName }).select("id").single();
  if (companyError) {
    const { data: found } = await supabase.from("companies").select("id").ilike("name", companyName).maybeSingle();
    if (!found) return { error: actionError(companyError) };
    return insertLead(supabase, userId, String((found as { id: string }).id), { firstName, lastName, email, linkedin, phone, source, status, formData });
  }
  return insertLead(supabase, userId, String((company as { id: string }).id), { firstName, lastName, email, linkedin, phone, source, status, formData });
}

async function insertLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  companyId: string,
  input: { firstName: string; lastName: string; email: string; linkedin: string | null; phone: string | null; source: string; status: string; formData: FormData },
) {
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert({
      company_id: companyId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email || null,
      linkedin_url: input.linkedin,
      phone: input.phone,
    })
    .select("id")
    .single();
  if (contactError || !contact) return { error: actionError(contactError) };
  const sendpilotStatus = (SENDPILOT_STATUSES as readonly string[]).includes(input.status) ? input.status : null;
  const outcome = sendpilotStatus === "Not Interested"
    ? notInterestedOutcome(optionalText(input.formData, "not_interested_outcome"))
    : null;
  const leadFields = {
    contact_id: (contact as { id: string }).id,
    company_id: companyId,
    source: input.source,
    sendpilot_status: sendpilotStatus,
    not_interested_outcome: outcome,
    last_synced_at: new Date().toISOString(),
  };
  let leadInsert = await supabase.from("leads").insert(leadFields).select("id").single();
  if (leadInsert.error && /not_interested_outcome/i.test(leadInsert.error.message)) {
    const { not_interested_outcome: _unused, ...withoutOutcome } = leadFields;
    void _unused;
    leadInsert = await supabase.from("leads").insert(withoutOutcome).select("id").single();
  }
  if (leadInsert.error || !leadInsert.data) return { error: actionError(leadInsert.error) };
  const leadId = String((leadInsert.data as { id: string }).id);
  await supabase.from("activities").insert({
    lead_id: leadId,
    contact_id: (contact as { id: string }).id,
    company_id: companyId,
    type: "lead_imported",
    title: "Lead added manually",
    actor_id: userId,
  });
  if (text(input.formData, "create_opportunity") === "yes") {
    const created = await createOpportunityForLead(supabase, userId, leadId, input.formData);
    if (created && "error" in created && created.error) return created;
    if (created && "id" in created) redirect(`/opportunities/${created.id}`);
  }
  refresh("/leads", "/reconciliation", "/dashboard");
  redirect(`/leads/${leadId}`);
}

export async function archiveLead(_state: ActionState, formData: FormData): Promise<ActionState> {
  const leadId = text(formData, "lead_id");
  const next = optionalText(formData, "next") ?? `/leads/${leadId}`;
  return archiveLeadIds([leadId], next);
}

export async function archiveLeadFromList(formData: FormData): Promise<void> {
  await archiveLead(null, formData);
}

export async function dismissReviewedRecord(formData: FormData): Promise<void> {
  const { supabase } = await requireWriter();
  const id = text(formData, "record_id");
  if (!isUuid(id)) {
    redirect(`/reconciliation?notice=${encodeURIComponent("That import row could not be found.")}`);
  }
  const { data, error } = await supabase.from("sendpilot_records").select("id, applied").eq("id", id).maybeSingle();
  if (error || !data) {
    redirect(`/reconciliation?notice=${encodeURIComponent("That import row could not be found.")}`);
  }
  if ((data as { applied: boolean }).applied) {
    redirect(`/reconciliation?notice=${encodeURIComponent("This row was already applied.")}`);
  }
  const { error: updateError } = await supabase
    .from("sendpilot_records")
    .update({ review_required: false })
    .eq("id", id)
    .eq("applied", false);
  if (updateError) {
    redirect(`/reconciliation?notice=${encodeURIComponent(actionError(updateError))}`);
  }
  refresh("/reconciliation");
  redirect(`/reconciliation?notice=${encodeURIComponent("Row dismissed.")}`);
}

export async function restoreLead(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  if (!isUuid(leadId)) return { error: "That lead could not be found." };
  const { error } = await supabase.from("leads").update({ archived_at: null, archived_by: null }).eq("id", leadId);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({
    lead_id: leadId,
    type: "record_updated",
    title: "Lead restored from archive",
    actor_id: userId,
  });
  refresh("/leads", "/opportunities", "/dashboard", "/reconciliation", "/reporting", `/leads/${leadId}`);
  redirect(`/leads/${leadId}?notice=${encodeURIComponent("Lead restored.")}`);
}

export async function archiveSelectedLeads(_state: ActionState, formData: FormData): Promise<ActionState> {
  const ids = formData.getAll("lead_id").map((value) => String(value)).filter((value) => isUuid(value));
  return archiveLeadIds(ids, "/leads");
}

async function archiveLeadIds(ids: string[], fallbackPath: string): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const unique = [...new Set(ids)].filter((id) => isUuid(id)).slice(0, 50);
  if (unique.length === 0) return { error: "Select at least one lead to archive." };
  const { error } = await supabase
    .from("leads")
    .update({ archived_at: new Date().toISOString(), archived_by: userId })
    .in("id", unique)
    .is("archived_at", null);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert(unique.map((leadId) => ({
    lead_id: leadId,
    type: "record_updated" as const,
    title: "Lead archived",
    actor_id: userId,
  })));
  refresh("/leads", "/opportunities", "/dashboard", "/reconciliation", "/reporting");
  const notice = unique.length === 1 ? "Lead archived." : `${unique.length} leads archived.`;
  const separator = fallbackPath.includes("?") ? "&" : "?";
  redirect(`${fallbackPath}${separator}notice=${encodeURIComponent(notice)}`);
}

export async function deleteLeadPermanently(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const confirmName = text(formData, "confirm_name");
  if (!isUuid(leadId)) return { error: "That lead could not be found." };
  if (text(formData, "confirm_delete") !== "yes") return { error: "Confirm that permanent deletion cannot be undone." };
  const { error } = await supabase.rpc("delete_lead_permanently", { p_lead_id: leadId, p_confirm_name: confirmName });
  if (error) return { error: actionError(error) };
  refresh("/leads", "/opportunities", "/dashboard", "/reconciliation", "/reporting");
  redirect("/leads?notice=" + encodeURIComponent("Lead permanently deleted. SendPilot will not recreate it unless you restore it from review."));
}

export async function updateLeadStatus(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const status = optionalText(formData, "sendpilot_status");
  const note = optionalText(formData, "note");
  const requestedOutcome = optionalText(formData, "not_interested_outcome");
  if (!isUuid(leadId)) return { error: "Choose a lead." };
  if (status && !(SENDPILOT_STATUSES as readonly string[]).includes(status)) return { error: "Choose a SendPilot status." };
  if (requestedOutcome && !(NOT_INTERESTED_OUTCOMES as readonly string[]).includes(requestedOutcome)) {
    return { error: "Choose a Not Interested reason." };
  }
  const { data: current, error: loadError } = await supabase.from("leads").select("sendpilot_status").eq("id", leadId).maybeSingle();
  if (loadError) return { error: actionError(loadError) };
  const previous = current?.sendpilot_status ? String(current.sendpilot_status) : null;
  const outcome = status === "Not Interested" ? notInterestedOutcome(requestedOutcome) : null;
  const { error } = await supabase
    .from("leads")
    .update({
      sendpilot_status: status || null,
      sendpilot_status_raw: status,
      not_interested_outcome: outcome,
    })
    .eq("id", leadId);
  if (error) return { error: outcomeColumnError(error) };
  if (previous !== (status || null) || note || outcome) {
    await supabase.from("activities").insert({
      lead_id: leadId,
      type: status === "Interested" && previous !== "Interested" ? "lead_became_interested" : "sendpilot_status_changed",
      title: status === "Not Interested"
        ? (outcome ? `Status set to Not Interested · ${outcome}` : "Status set to Not Interested")
        : status ? `Status set to ${status}` : "Status cleared",
      body: note ?? (previous ? `Was ${previous}` : null),
      actor_id: userId,
    });
  }
  if (status === "Interested") {
    const created = await maybeAutoCreateInterestedOpportunity(supabase, userId, leadId);
    if (created.error) return { error: created.error };
  } else if (leadHasResponded({ sendpilotStatus: status })) {
    await cancelAutomationTypes(supabase, {
      leadId,
      types: ["interested_follow_1", "interested_follow_2", "nurture_suggest"],
    });
  }
  refresh(`/leads/${leadId}`, "/leads", "/dashboard", "/reconciliation", "/opportunities", "/follow-ups");
  return { success: "Lead status saved." };
}

export async function updateLeadStatusFromList(formData: FormData): Promise<ActionState> {
  return updateLeadStatus(null, formData);
}

export async function dropLeadOnOutcome(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const column = text(formData, "not_interested_outcome");
  const unsorted = column === NOT_INTERESTED_INTAKE;
  if (!isUuid(leadId) || (!unsorted && !(NOT_INTERESTED_OUTCOMES as readonly string[]).includes(column))) {
    return { error: "Choose a Not Interested reason." };
  }
  const outcome = unsorted ? null : column;
  const { error } = await supabase
    .from("leads")
    .update({
      sendpilot_status: "Not Interested",
      not_interested_outcome: outcome,
    })
    .eq("id", leadId);
  if (error) return { error: outcomeColumnError(error) };
  await supabase.from("activities").insert({
    lead_id: leadId,
    type: "sendpilot_status_changed",
    title: unsorted ? "Returned to SendPilot Not Interested" : `Not Interested set to ${outcome}`,
    actor_id: userId,
  });
  refresh(`/leads/${leadId}`, "/leads", "/opportunities", "/follow-ups", "/dashboard");
  return { success: unsorted ? "Returned to Not Interested." : `Moved to ${outcome}.` };
}

function outcomeColumnError(error: { message: string; code?: string }) {
  if (error.code === "PGRST204" || /not_interested_outcome/i.test(error.message)) {
    return "Apply supabase/migrations/20260923215000_not_interested_outcomes.sql in the Supabase SQL editor so Not Interested leads can be sorted.";
  }
  return actionError(error);
}

function flagColumnError(error: { message: string; code?: string }) {
  if (error.code === "PGRST204" || /account_flag/i.test(error.message)) {
    return "Apply supabase/migrations/20260924183000_account_flags.sql in the Supabase SQL editor so account flags can be saved.";
  }
  return actionError(error);
}

async function writeAccountFlag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { leadId: string; opportunityId?: string | null; flag: string | null },
) {
  const flag = accountFlag(input.flag);
  if (isUuid(input.leadId)) {
    const { error } = await supabase.from("leads").update({ account_flag: flag }).eq("id", input.leadId);
    if (error) return { error: flagColumnError(error) };
  }
  if (input.opportunityId && isUuid(input.opportunityId)) {
    const { error } = await supabase.from("opportunities").update({ account_flag: flag }).eq("id", input.opportunityId);
    if (error) return { error: flagColumnError(error) };
  }
  return { success: flag ? `Flagged as ${flag}.` : "Flag cleared." };
}

export async function setAccountFlagFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const leadId = text(formData, "lead_id");
  if (!isUuid(leadId)) return { error: "Choose an account." };
  const saved = await writeAccountFlag(supabase, {
    leadId,
    opportunityId: optionalText(formData, "opportunity_id"),
    flag: optionalText(formData, "account_flag"),
  });
  if (saved.error) return saved;
  const opportunityId = optionalText(formData, "opportunity_id");
  refresh("/opportunities", "/leads", "/dashboard", `/leads/${leadId}`);
  if (opportunityId && isUuid(opportunityId)) refresh(`/opportunities/${opportunityId}`);
  return saved;
}

export async function setAccountFlag(_state: ActionState, formData: FormData): Promise<ActionState> {
  return setAccountFlagFromBoard(formData);
}

export async function createOpportunity(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  if (!isUuid(leadId)) return { error: "Choose a lead." };
  const created = await createOpportunityForLead(supabase, userId, leadId, formData);
  if (!created) return { error: "The opportunity could not be created." };
  if ("error" in created) return created;
  refresh("/opportunities", "/leads", "/dashboard", "/reconciliation", `/leads/${leadId}`);
  redirect(`/opportunities/${created.id}`);
}

export async function updateNextAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const id = text(formData, "opportunity_id");
  const nextAction = text(formData, "next_action");
  let nextActionDate = dateField(formData, "next_action_date");
  const waiting = (WAITING_ON as readonly string[]).includes(text(formData, "waiting_on")) ? text(formData, "waiting_on") : "internal";
  const risk = (RISK_LEVELS as readonly string[]).includes(text(formData, "risk_level")) ? text(formData, "risk_level") : "low";
  if (!isUuid(id) || !nextAction) return { error: "Next action is required." };
  if (!nextActionDate) {
    const existing = await supabase.from("opportunities").select("next_action_date").eq("id", id).maybeSingle();
    const stored = existing.data ? String((existing.data as { next_action_date?: string | null }).next_action_date ?? "") : "";
    nextActionDate = /^\d{4}-\d{2}-\d{2}/.test(stored) ? stored.slice(0, 10) : nextActionDate;
  }
  const { error } = await supabase.from("opportunities").update({ next_action: nextAction, next_action_date: nextActionDate, waiting_on: waiting, risk_level: risk }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: id, type: "record_updated", title: "Next action updated", body: `${nextAction} · ${nextActionDate}`, actor_id: userId });
  refresh(`/opportunities/${id}`, "/dashboard", "/opportunities");
  return { success: "Next action saved." };
}

export async function moveStage(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const id = text(formData, "opportunity_id");
  const stage = text(formData, "stage") as OpportunityStage;
  if (!isUuid(id) || !(OPPORTUNITY_STAGES as readonly string[]).includes(stage)) return { error: "Choose a stage." };
  const nextAction = optionalText(formData, "next_action");
  let nextActionDate = dateField(formData, "next_action_date");
  if (stageRequiresNextAction(stage) && !nextAction) {
    return { error: "Every active opportunity needs a next action." };
  }
  if (!nextActionDate) {
    const existing = await supabase.from("opportunities").select("next_action_date").eq("id", id).maybeSingle();
    const stored = existing.data ? String((existing.data as { next_action_date?: string | null }).next_action_date ?? "") : "";
    nextActionDate = /^\d{4}-\d{2}-\d{2}/.test(stored) ? stored.slice(0, 10) : null;
  }
  const { error } = await supabase.rpc("update_opportunity_stage", {
    p_opportunity_id: id,
    p_stage: stage,
    p_note: optionalText(formData, "note"),
    p_next_action: nextAction,
    p_next_action_date: nextActionDate,
    p_waiting_on: (WAITING_ON as readonly string[]).includes(text(formData, "waiting_on")) ? text(formData, "waiting_on") : "internal",
    p_risk: (RISK_LEVELS as readonly string[]).includes(text(formData, "risk_level")) ? text(formData, "risk_level") : "low",
    p_lost_reason: optionalText(formData, "lost_reason"),
  });
  if (error) return { error: actionError(error) };
  const opportunity = await supabase.from("opportunities").select("lead_id, target_start_on").eq("id", id).maybeSingle();
  const leadId = opportunity.data ? String((opportunity.data as { lead_id?: string }).lead_id ?? "") : "";
  const targetStart = dateField(formData, "target_start_on")
    ?? (opportunity.data ? String((opportunity.data as { target_start_on?: string | null }).target_start_on ?? "") || null : null);
  if (dateField(formData, "target_start_on")) {
    await supabase.from("opportunities").update({ target_start_on: dateField(formData, "target_start_on") }).eq("id", id);
  }
  const nurtureNotes = optionalText(formData, "nurture_notes");
  if (nurtureNotes) {
    await supabase.from("opportunities").update({ nurture_notes: nurtureNotes }).eq("id", id);
  }
  await cancelTypesForStage(supabase, { opportunityId: id, leadId: isUuid(leadId) ? leadId : null, stage });
  const { userId } = await requireWriter();
  if (stage === "On Hold / Nurture") {
    await upsertAutomationTasks(supabase, userId, planNurtureCheckIns({
      leadId: isUuid(leadId) ? leadId : id,
      opportunityId: id,
      movedOn: todayInWorkflowZone(),
    }));
  }
  if (stage === "SOW Preparation" || stage === "SOW Sent") {
    await upsertAutomationTasks(supabase, userId, planSowConfirmStart({ opportunityId: id, leadId: isUuid(leadId) ? leadId : null }));
    if (targetStart) {
      await upsertAutomationTasks(supabase, userId, planSowSignature({
        opportunityId: id,
        leadId: isUuid(leadId) ? leadId : null,
        targetStartOn: targetStart,
      }));
    }
  }
  if (stage === "SOW Signed") {
    await upsertAutomationTasks(supabase, userId, planSignedSowTasks({
      opportunityId: id,
      leadId: isUuid(leadId) ? leadId : null,
      targetStartOn: targetStart,
      signedOn: todayInWorkflowZone(),
    }));
  }
  if (stage === "Onboarding") {
    await upsertAutomationTasks(supabase, userId, planTrialPeriodTasks({
      opportunityId: id,
      leadId: isUuid(leadId) ? leadId : null,
    }));
  }
  refresh(`/opportunities/${id}`, "/dashboard", "/opportunities", "/reporting");
  return { success: `Moved to ${stage}. History was kept.` };
}

export async function dropOpportunityOnStage(formData: FormData): Promise<ActionState> {
  return moveStage({}, formData);
}

export async function dropLeadOnStage(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const stage = text(formData, "stage") as OpportunityStage;
  if (!isUuid(leadId) || !(OPPORTUNITY_STAGES as readonly string[]).includes(stage)) return { error: "Choose a stage." };
  if (stage === "Client Started" || stage === "Lost") {
    return { error: stage === "Lost" ? "Open the opportunity and add a lost reason first." : "Use Client start on the opportunity page." };
  }
  if (stage === "Interested") return { success: "This lead is already tagged Interested in SendPilot." };

  const { data: existingRows, error: loadError } = await supabase
    .from("opportunities")
    .select("id, next_action, next_action_date, waiting_on, risk_level")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (loadError) return { error: actionError(loadError) };
  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

  const playbook = STAGE_PLAYBOOK[stage];
  const nextAction = optionalText(formData, "next_action") ?? playbook.nextAction;
  const nextActionDate = dateField(formData, "next_action_date") ?? new Date().toISOString().slice(0, 10);

  if (existing) {
    const moveData = new FormData();
    moveData.set("opportunity_id", String((existing as { id: string }).id));
    moveData.set("stage", stage);
    moveData.set("next_action", optionalText(formData, "next_action") ?? String((existing as { next_action?: string }).next_action ?? nextAction));
    moveData.set("next_action_date", dateField(formData, "next_action_date") ?? String((existing as { next_action_date?: string }).next_action_date ?? nextActionDate));
    moveData.set("waiting_on", String((existing as { waiting_on?: string }).waiting_on ?? playbook.waitingOn));
    moveData.set("risk_level", String((existing as { risk_level?: string }).risk_level ?? "low"));
    moveData.set("note", `Moved from SendPilot Interested to ${stage}`);
    return moveStage({}, moveData);
  }

  const createData = new FormData();
  createData.set("stage", stage);
  createData.set("next_action", nextAction);
  createData.set("next_action_date", nextActionDate);
  createData.set("waiting_on", playbook.waitingOn);
  const created = await createOpportunityForLead(supabase, userId, leadId, createData);
  if (!created) return { error: "The opportunity could not be created." };
  if ("error" in created) return created;
  refresh("/opportunities", "/leads", "/dashboard", "/reconciliation", `/leads/${leadId}`, `/opportunities/${created.id}`);
  return { success: `Started the client journey at ${stage}.` };
}

export async function saveProfileSendFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const email = text(formData, "client_email").toLowerCase();
  const sentOn = dateField(formData, "profile_sent_on");
  const callOn = dateField(formData, "call_on");
  const notes = optionalText(formData, "notes");
  if (!isUuid(leadId) || !email || !sentOn) {
    return { error: "Email and when the email/profiles were sent are required." };
  }
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, contact_id, company_id, contacts(first_name, last_name, email), companies(name)")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError || !lead) return { error: "That lead could not be found." };
  const record = lead as { id: string; contact_id: string; company_id: string };
  const { error: emailError } = await supabase.from("contacts").update({ email }).eq("id", record.contact_id);
  if (emailError) return { error: actionError(emailError) };

  let opportunityId = optionalText(formData, "opportunity_id");
  const nextAction = "First Profile Follow-Up";
  const nextActionDate = planSalesProfileFollowUps({ opportunityId: opportunityId || leadId, leadId, sentOn })[0]?.dueOn ?? sentOn;
  if (opportunityId && isUuid(opportunityId)) {
    const moveData = new FormData();
    moveData.set("opportunity_id", opportunityId);
    moveData.set("stage", PROFILE_SEND_STAGE);
    moveData.set("next_action", nextAction);
    moveData.set("next_action_date", nextActionDate);
    moveData.set("waiting_on", "client");
    moveData.set("note", notes ?? "Profile sent to the client");
    const moved = await moveStage({}, moveData);
    if (moved?.error) return moved;
  } else {
    const createData = new FormData();
    createData.set("stage", PROFILE_SEND_STAGE);
    createData.set("next_action", nextAction);
    createData.set("next_action_date", nextActionDate);
    createData.set("waiting_on", "client");
    const created = await createOpportunityForLead(supabase, userId, leadId, createData);
    if (!created) return { error: "The opportunity could not be created." };
    if ("error" in created) return created;
    opportunityId = created.id;
  }

  const company = Array.isArray((lead as { companies?: { name?: string } | { name?: string }[] }).companies)
    ? (lead as { companies: { name?: string }[] }).companies[0]
    : (lead as { companies?: { name?: string } }).companies;
  const callPayload = {
    opportunity_id: opportunityId,
    call_on: callOn,
    company_name: optionalText(formData, "company_name") ?? company?.name,
    client_name: optionalText(formData, "client_name"),
    status: callOn ? "Scheduled" : "Draft",
    notes,
  };
  const { data: existingCall } = await supabase.from("strategy_calls").select("id").eq("opportunity_id", opportunityId).maybeSingle();
  const { error: callError } = existingCall
    ? await supabase.from("strategy_calls").update(callPayload).eq("opportunity_id", opportunityId)
    : await supabase.from("strategy_calls").insert(callPayload);
  if (callError) return { error: actionError(callError) };

  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "profile_sent",
    title: "Profile sent to the client",
    body: notes ?? `Sent on ${sentOn}${callOn ? ` · call scheduled ${callOn}` : ""}`,
    actor_id: userId,
    occurred_at: new Date(`${sentOn}T12:00:00Z`).toISOString(),
  });
  if (callOn) {
    await supabase.from("activities").insert({
      opportunity_id: opportunityId,
      lead_id: leadId,
      type: "strategy_call_scheduled",
      title: "Strategy call scheduled",
      body: callOn,
      actor_id: userId,
    });
  }

  await cancelAutomationTypes(supabase, {
    opportunityId,
    leadId,
    types: ["interested_follow_1", "interested_follow_2", "nurture_suggest"],
  });
  await upsertAutomationTasks(supabase, userId, planSalesProfileFollowUps({
    opportunityId: opportunityId as string,
    leadId,
    sentOn,
  }));

  const flagged = await writeAccountFlag(supabase, {
    leadId,
    opportunityId,
    flag: optionalText(formData, "account_flag"),
  });
  if (flagged.error) return flagged;

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Profile send recorded. The check-back tasks are on reminders and the week calendar." };
}

export async function saveBookedSalesCallFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const callOn = dateField(formData, "call_on");
  const callTime = text(formData, "call_time");
  if (!isUuid(leadId) || !callOn || !/^\d{1,2}:\d{2}/.test(callTime)) {
    return { error: "Enter the meeting date and time." };
  }
  const clock = formatClock(callTime);
  const title = `Sales call at ${clock}`;

  let opportunityId = optionalText(formData, "opportunity_id");
  if (opportunityId && isUuid(opportunityId)) {
    const moveData = new FormData();
    moveData.set("opportunity_id", opportunityId);
    moveData.set("stage", BOOKED_CALL_STAGE);
    moveData.set("next_action", title);
    moveData.set("next_action_date", callOn);
    moveData.set("waiting_on", "client");
    moveData.set("note", `Meeting booked for ${callOn} at ${clock}`);
    const moved = await moveStage({}, moveData);
    if (moved?.error) return moved;
  } else {
    const createData = new FormData();
    createData.set("stage", BOOKED_CALL_STAGE);
    createData.set("next_action", title);
    createData.set("next_action_date", callOn);
    createData.set("waiting_on", "client");
    const created = await createOpportunityForLead(supabase, userId, leadId, createData);
    if (!created) return { error: "The opportunity could not be created." };
    if ("error" in created) return created;
    opportunityId = created.id;
  }

  const callPayload = {
    opportunity_id: opportunityId,
    call_on: callOn,
    schedule: callTime,
    company_name: optionalText(formData, "company_name"),
    client_name: optionalText(formData, "client_name"),
    status: "Scheduled",
    notes: `Booked for ${callOn} at ${clock}`,
  };
  const { data: existingCall } = await supabase.from("strategy_calls").select("id").eq("opportunity_id", opportunityId).maybeSingle();
  const { error: callError } = existingCall
    ? await supabase.from("strategy_calls").update(callPayload).eq("opportunity_id", opportunityId)
    : await supabase.from("strategy_calls").insert(callPayload);
  if (callError) return { error: actionError(callError) };

  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "strategy_call_scheduled",
    title,
    body: `${callOn} at ${clock}`,
    actor_id: userId,
  });
  await cancelAutomationTypes(supabase, {
    opportunityId,
    leadId,
    types: ["interested_follow_1", "interested_follow_2", "nurture_suggest", "sales_profile_follow_1", "sales_profile_follow_2", "sales_profile_follow_3"],
  });
  await upsertAutomationTasks(supabase, userId, planBookedCallTasks({
    opportunityId: opportunityId as string,
    leadId,
    callOn,
    clientName: optionalText(formData, "client_name"),
    companyName: optionalText(formData, "company_name"),
    callTime: clock,
  }));

  const flagged = await writeAccountFlag(supabase, {
    leadId,
    opportunityId,
    flag: optionalText(formData, "account_flag"),
  });
  if (flagged.error) return flagged;

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Sales call booked. It is on reminders, tasks, and the week calendar." };
}

export async function saveSalesCallCompleteFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const callOn = dateField(formData, "call_on");
  const notes = optionalText(formData, "notes");
  if (!isUuid(leadId) || !callOn) {
    return { error: "Enter the date the call happened." };
  }

  const items = SALES_CALL_COMPLETE_TASKS.map((title, index) => ({
    title,
    due: dateField(formData, `task_due_${index}`) ?? callOn,
  }));
  if (items.some((item) => !item.due)) {
    return { error: "Give each task a due date." };
  }

  const nextAction = items[0]?.title ?? "Send the meeting notes";
  const nextActionDate = items.reduce((earliest, item) => (item.due < earliest ? item.due : earliest), items[0].due);

  let opportunityId = optionalText(formData, "opportunity_id");
  if (opportunityId && isUuid(opportunityId)) {
    const moveData = new FormData();
    moveData.set("opportunity_id", opportunityId);
    moveData.set("stage", SALES_CALL_COMPLETE_STAGE);
    moveData.set("next_action", nextAction);
    moveData.set("next_action_date", nextActionDate);
    moveData.set("waiting_on", "internal");
    moveData.set("note", notes ?? `Sales call completed on ${callOn}`);
    const moved = await moveStage({}, moveData);
    if (moved?.error) return moved;
  } else {
    const createData = new FormData();
    createData.set("stage", SALES_CALL_COMPLETE_STAGE);
    createData.set("next_action", nextAction);
    createData.set("next_action_date", nextActionDate);
    createData.set("waiting_on", "internal");
    const created = await createOpportunityForLead(supabase, userId, leadId, createData);
    if (!created) return { error: "The opportunity could not be created." };
    if ("error" in created) return created;
    opportunityId = created.id;
  }

  const callPayload = {
    opportunity_id: opportunityId,
    call_on: callOn,
    company_name: optionalText(formData, "company_name"),
    client_name: optionalText(formData, "client_name"),
    status: "Complete",
    notes: notes ?? `Sales call completed on ${callOn}`,
    tasks: items.map((item) => item.title).join("\n"),
  };
  const { data: existingCall } = await supabase.from("strategy_calls").select("id").eq("opportunity_id", opportunityId).maybeSingle();
  const { error: callError } = existingCall
    ? await supabase.from("strategy_calls").update(callPayload).eq("opportunity_id", opportunityId)
    : await supabase.from("strategy_calls").insert(callPayload);
  if (callError) return { error: actionError(callError) };

  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "strategy_call_completed",
    title: "Sales call completed",
    body: notes ?? `Completed on ${callOn}. Next: ${items.map((item) => item.title).join("; ")}`,
    actor_id: userId,
    occurred_at: new Date(`${callOn}T12:00:00Z`).toISOString(),
  });

  await cancelAutomationTypes(supabase, {
    opportunityId,
    leadId,
    types: ["call_research", "call_slides", "call_day"],
  });
  await upsertAutomationTasks(supabase, userId, planSalesCallCompleteTasks({
    opportunityId: opportunityId as string,
    leadId,
    callOn,
  }));

  const flagged = await writeAccountFlag(supabase, {
    leadId,
    opportunityId,
    flag: optionalText(formData, "account_flag"),
  });
  if (flagged.error) return flagged;

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Sales call marked complete. Review notes and the talent request are on reminders and the week calendar." };
}

export async function createFollowUp(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  const title = text(formData, "title");
  const dueOn = dateField(formData, "due_on");
  if ((!opportunityId && !leadId) || !title || !dueOn) return { error: "A follow-up needs a title and a due date." };
  const { data: inserted, error } = await supabase.from("follow_ups").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    owner_id: userId,
    title,
    due_on: dueOn,
    reason: optionalText(formData, "reason"),
    notes: optionalText(formData, "notes"),
  }).select("id").single();
  if (error) return { error: actionError(error) };
  const followUpId = inserted ? String((inserted as { id: string }).id) : null;
  if (opportunityId) {
    await supabase.from("tasks").insert({
      opportunity_id: opportunityId,
      owner_id: userId,
      title,
      details: optionalText(formData, "notes"),
      due_on: dueOn,
      follow_up_id: followUpId,
      status: "open",
    });
  }
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "follow_up_created",
    title: "Follow-up created",
    body: `${title} · ${dueOn}`,
    actor_id: userId,
  });
  if (opportunityId) {
    await syncOpportunityNextAction(supabase, opportunityId);
  }
  refresh(
    "/follow-ups",
    "/dashboard",
    "/leads",
    leadId ? `/leads/${leadId}` : "/leads",
    opportunityId ? `/opportunities/${opportunityId}` : "/follow-ups",
  );
  return { success: "Follow-up scheduled." };
}

export async function completeFollowUp(formData: FormData) {
  const { supabase, userId } = await requireWriter();
  const id = text(formData, "follow_up_id");
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  if (!isUuid(id)) return;
  await completeLinkedTaskRecords(supabase, id);
  await afterFollowUpCompleted(supabase, userId, id);
  if (opportunityId) await syncOpportunityNextAction(supabase, opportunityId);
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "follow_up_completed",
    title: "Follow-up completed",
    actor_id: userId,
  });
  refresh("/follow-ups", "/dashboard", "/notifications", "/leads", opportunityId ? `/opportunities/${opportunityId}` : "/follow-ups", leadId ? `/leads/${leadId}` : "/leads");
}

export async function saveStrategyCall(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  if (!isUuid(opportunityId)) return { error: "Opportunity not found." };
  const status = text(formData, "status");
  if (!["Draft", "Scheduled", "Complete", "Cancelled"].includes(status)) return { error: "Choose a strategy call status." };
  const headcount = optionalNumber(formData, "headcount_requirement");
  const rate = optionalNumber(formData, "client_billing_rate");
  if (Number.isNaN(headcount) || Number.isNaN(rate)) return { error: "Headcount must be a number." };
  const payload = {
    opportunity_id: opportunityId,
    call_on: dateField(formData, "call_on"),
    client_name: optionalText(formData, "client_name"),
    company_name: optionalText(formData, "company_name"),
    headcount_requirement: headcount,
    work_arrangement: optionalText(formData, "work_arrangement"),
    schedule: optionalText(formData, "schedule"),
    preferred_virtual_staff: optionalText(formData, "preferred_virtual_staff"),
    tools: optionalText(formData, "tools"),
    start_date_target: dateField(formData, "start_date_target"),
    client_billing_rate: rate,
    status,
    tasks: optionalText(formData, "tasks"),
    ideal_candidate: optionalText(formData, "ideal_candidate"),
    deal_breakers: optionalText(formData, "deal_breakers"),
    current_staffing: optionalText(formData, "current_staffing"),
    reason_for_hiring: optionalText(formData, "reason_for_hiring"),
    main_pain_point: optionalText(formData, "main_pain_point"),
    urgency: optionalText(formData, "urgency"),
    budget: optionalText(formData, "budget"),
    decision_maker: optionalText(formData, "decision_maker"),
    decision_timeline: optionalText(formData, "decision_timeline"),
    number_of_positions: optionalNumber(formData, "number_of_positions"),
    employment_type: optionalText(formData, "employment_type"),
    timezone: optionalText(formData, "timezone"),
    special_requirements: optionalText(formData, "special_requirements"),
    notes: optionalText(formData, "notes"),
  };
  const { data: existing } = await supabase.from("strategy_calls").select("id, status").eq("opportunity_id", opportunityId).maybeSingle();
  const { error } = existing
    ? await supabase.from("strategy_calls").update(payload).eq("opportunity_id", opportunityId)
    : await supabase.from("strategy_calls").insert(payload);
  if (error) return { error: actionError(error) };
  if (headcount || rate) {
    await supabase.from("opportunities").update({ headcount: headcount ?? undefined, billing_rate: rate ?? undefined }).eq("id", opportunityId);
  }
  const previous = (existing as { status?: string } | null)?.status;
  if (status === "Complete" && previous !== "Complete") {
    await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "strategy_call_completed", title: "Strategy call completed", actor_id: userId });
  } else if (status === "Scheduled" && previous !== "Scheduled") {
    await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "strategy_call_scheduled", title: "Strategy call scheduled", actor_id: userId });
  } else {
    await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "record_updated", title: "Strategy call updated", actor_id: userId });
  }
  const callOn = dateField(formData, "call_on");
  const leadId = await opportunityLeadId(supabase, opportunityId);
  if (status === "Scheduled" && callOn) {
    await upsertAutomationTasks(supabase, userId, planBookedCallTasks({
      opportunityId,
      leadId,
      callOn,
      clientName: optionalText(formData, "client_name"),
      companyName: optionalText(formData, "company_name"),
      callTime: optionalText(formData, "schedule") ? formatClock(text(formData, "schedule")) : null,
    }));
  }
  if (status === "Complete" && callOn) {
    await cancelAutomationTypes(supabase, { opportunityId, types: ["call_research", "call_slides", "call_day"] });
    await upsertAutomationTasks(supabase, userId, planSalesCallCompleteTasks({ opportunityId, leadId, callOn }));
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Strategy call saved." };
}

export async function sendToRecruitment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  if (!isUuid(opportunityId)) return { error: "Opportunity not found." };
  const { data: existing } = await supabase.from("recruitment_requests").select("id").eq("opportunity_id", opportunityId).maybeSingle();
  if (existing) return { error: "A recruitment request already exists for this opportunity." };
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .select("id, stage, status, headcount, billing_rate, notes, companies(name), contacts(first_name, last_name)")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !opportunity) return { error: "Opportunity not found." };
  if ((opportunity as { status: string }).status === "lost") return { error: "Lost opportunities are not sent to recruitment." };
  const { data: call } = await supabase.from("strategy_calls").select("*").eq("opportunity_id", opportunityId).maybeSingle();
  const callRow = (call ?? {}) as Record<string, string | number | null>;
  const opp = opportunity as { stage: string; headcount: number | null; billing_rate: number | null; notes: string | null; companies: { name: string } | { name: string }[] | null; contacts: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null };
  const company = Array.isArray(opp.companies) ? opp.companies[0] : opp.companies;
  const contact = Array.isArray(opp.contacts) ? opp.contacts[0] : opp.contacts;
  if (!call && opp.stage !== "Requirements Captured" && opp.stage !== "Recruitment") {
    return { error: "Save the strategy call or move the opportunity to Requirements Captured before sending it to recruitment." };
  }
  const requestedOn = dateField(formData, "sent_on") ?? todayInWorkflowZone();
  const agreed = dateField(formData, "target_on") ?? (typeof callRow.start_date_target === "string" ? callRow.start_date_target : null);
  const target = defaultRecruitmentTarget(requestedOn, agreed);
  const { error: insertError } = await supabase.from("recruitment_requests").insert({
    opportunity_id: opportunityId,
    strategy_call_id: call ? (call as { id: string }).id : null,
    status: "Not Started",
    target_on: target,
    urgent: text(formData, "urgent") === "yes",
    client_name: callRow.client_name ?? [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
    company_name: callRow.company_name ?? company?.name,
    headcount: callRow.headcount_requirement ?? opp.headcount,
    work_arrangement: callRow.work_arrangement,
    schedule: callRow.schedule,
    preferred_staff: callRow.preferred_virtual_staff,
    tools: callRow.tools,
    start_date: callRow.start_date_target,
    billing_rate: callRow.client_billing_rate ?? opp.billing_rate,
    ideal_candidate: callRow.ideal_candidate,
    deal_breakers: callRow.deal_breakers,
    tasks: callRow.tasks,
    notes: callRow.notes ?? opp.notes,
  });
  if (insertError) return { error: actionError(insertError) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "recruitment_requested", title: "Sent to recruitment", body: `Target ${target}`, actor_id: userId });
  const leadId = await opportunityLeadId(supabase, opportunityId);
  await cancelAutomationTypes(supabase, { opportunityId, types: ["call_notes", "call_talent_request"] });
  const planned = await upsertAutomationTasks(supabase, userId, planRecruitmentProgress({ opportunityId, leadId, requestedOn }));
  if (planned?.error) return planned;
  const early = ["Interested", "Email / Profile Preparation", "Strategy Call Proposed", "Strategy Call Scheduled", "Strategy Call Complete", "Requirements Captured", "On Hold / Nurture"];
  if (early.includes(opp.stage)) {
    await supabase.rpc("update_opportunity_stage", {
      p_opportunity_id: opportunityId,
      p_stage: "Recruitment",
      p_note: "Sent to recruitment",
      p_next_action: "Check recruitment progress against the target date",
      p_next_action_date: target,
      p_waiting_on: "recruitment",
      p_risk: "low",
      p_lost_reason: null,
    });
  }
  refresh(`/opportunities/${opportunityId}`, "/recruitment", "/dashboard");
  return { success: "Recruitment request created from the opportunity. Nothing had to be retyped." };
}

export async function updateRecruitmentStatus(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const id = text(formData, "recruitment_id");
  const status = text(formData, "status");
  const opportunityId = text(formData, "opportunity_id");
  if (!isUuid(id) || !(RECRUITMENT_STATUSES as readonly string[]).includes(status)) return { error: "Choose a recruitment status." };
  const { error } = await supabase.from("recruitment_requests").update({ status, notes: optionalText(formData, "notes") ?? undefined }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "record_updated", title: `Recruitment status: ${status}`, actor_id: userId });
  refresh(`/recruitment/${id}`, `/opportunities/${opportunityId}`, "/recruitment", "/dashboard");
  return { success: "Recruitment status updated." };
}

export async function addCandidate(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const requestId = text(formData, "recruitment_id");
  const opportunityId = text(formData, "opportunity_id");
  const name = text(formData, "name");
  if (!isUuid(requestId) || !name) return { error: "Candidate name is required." };
  const { error } = await supabase.from("candidates").insert({
    recruitment_request_id: requestId,
    name,
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    notes: optionalText(formData, "notes"),
    status: "Sourcing",
  });
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "candidate_added", title: `Candidate added: ${name}`, actor_id: userId });
  refresh(`/recruitment/${requestId}`, `/opportunities/${opportunityId}`);
  return { success: `${name} added. Their status history starts at Sourcing.` };
}

export async function updateCandidate(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const id = text(formData, "candidate_id");
  const status = text(formData, "status");
  const opportunityId = text(formData, "opportunity_id");
  const requestId = text(formData, "recruitment_id");
  if (!isUuid(id) || !(CANDIDATE_STATUSES as readonly string[]).includes(status)) return { error: "Choose a candidate status." };
  const { error } = await supabase.from("candidates").update({
    status,
    client_feedback: optionalText(formData, "client_feedback"),
    notes: optionalText(formData, "notes"),
    date_sent_to_client: dateField(formData, "date_sent_to_client"),
  }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "record_updated", title: `Candidate status: ${status}`, actor_id: userId });
  if (status === "Selected" && isUuid(opportunityId)) {
    await cancelAutomationTypes(supabase, {
      opportunityId,
      types: ["interview_feedback_1", "interview_feedback_2", "interview_review_7"],
    });
  }
  refresh(`/recruitment/${requestId}`, `/opportunities/${opportunityId}`);
  return { success: "Candidate updated. Previous status stays in history." };
}

export async function recordProfileBatch(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const requestId = optionalText(formData, "recruitment_id");
  const sentOn = dateField(formData, "sent_on");
  const candidateIds = formData.getAll("candidate_id").map(String).filter(isUuid);
  if (!isUuid(opportunityId) || !sentOn) return { error: "A sent date is required." };
  if (candidateIds.length === 0) return { error: "Select at least one candidate." };
  const { data: batch, error } = await supabase.from("profile_batches").insert({
    opportunity_id: opportunityId,
    recruitment_request_id: requestId,
    sent_on: sentOn,
    profile_count: candidateIds.length,
    follow_up_on: dateField(formData, "follow_up_on"),
    notes: optionalText(formData, "notes"),
    created_by: userId,
  }).select("id").single();
  if (error || !batch) return { error: actionError(error) };
  const batchId = String((batch as { id: string }).id);
  const { error: linkError } = await supabase.from("profile_batch_candidates").insert(candidateIds.map((candidateId) => ({ profile_batch_id: batchId, candidate_id: candidateId })));
  if (linkError) return { error: actionError(linkError) };
  await supabase.from("candidates").update({ status: "Sent", date_sent_to_client: sentOn }).in("id", candidateIds);
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "profile_sent", title: `${candidateIds.length} profiles sent`, body: optionalText(formData, "notes"), actor_id: userId, occurred_at: `${sentOn}T12:00:00Z` });
  const leadId = await opportunityLeadId(supabase, opportunityId);
  await cancelAutomationTypes(supabase, { opportunityId, types: ["recruitment_progress"] });
  await upsertAutomationTasks(supabase, userId, planCandidateProfileFollowUp({ opportunityId, leadId, sentOn }));
  if (text(formData, "move_stage") === "yes") {
    await supabase.rpc("update_opportunity_stage", {
      p_opportunity_id: opportunityId,
      p_stage: "Profiles Sent",
      p_note: "Profiles sent to the client",
      p_next_action: "Follow up on the profiles waiting with the client",
      p_next_action_date: dateField(formData, "follow_up_on") ?? sentOn,
      p_waiting_on: "client",
      p_risk: "medium",
      p_lost_reason: null,
    });
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/recruitment");
  return { success: "Profile send recorded. The waiting clock starts from the sent date." };
}

export async function recordClientResponse(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const id = text(formData, "batch_id");
  const opportunityId = text(formData, "opportunity_id");
  const response = text(formData, "client_response");
  if (!isUuid(id) || !response) return { error: "Write the client response before saving." };
  const { error } = await supabase.from("profile_batches").update({ client_response: response }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "client_response_received", title: "Client response received", body: response, actor_id: userId });
  if (isUuid(opportunityId)) {
    await cancelAutomationTypes(supabase, {
      opportunityId,
      types: ["candidate_profile_follow_1", "candidate_profile_follow_2", "awaiting_client_review"],
    });
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Client response saved." };
}

export async function saveInterview(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const status = text(formData, "status");
  const candidateName = text(formData, "candidate_name");
  if (!isUuid(opportunityId) || !candidateName || !(INTERVIEW_STATUSES as readonly string[]).includes(status)) {
    return { error: "Candidate, status, and opportunity are required." };
  }
  const interviewId = optionalText(formData, "interview_id");
  const when = text(formData, "interview_at");
  const whenIso = when
    ? (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}/.test(when) && !when.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(when)
      ? civilTimeInZoneToIso(when.slice(0, 10), when.slice(11, 16))
      : new Date(when).toISOString())
    : null;
  if (when && !whenIso) return { error: "Enter a valid interview date and time." };
  const payload = {
    opportunity_id: opportunityId,
    candidate_id: optionalText(formData, "candidate_id"),
    candidate_name: candidateName,
    client_name: optionalText(formData, "client_name"),
    interview_at: whenIso,
    status,
    client_feedback: optionalText(formData, "client_feedback"),
    next_action: optionalText(formData, "next_action"),
    notes: optionalText(formData, "notes"),
  };
  const saved = interviewId
    ? await supabase.from("interviews").update(payload).eq("id", interviewId).select("id").single()
    : await supabase.from("interviews").insert(payload).select("id").single();
  if (saved.error) return { error: actionError(saved.error) };
  const savedId = String((saved.data as { id: string }).id);
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    type: status === "Completed" ? "interview_completed" : "interview_scheduled",
    title: status === "Completed" ? `Interview completed: ${candidateName}` : `Interview ${status.toLowerCase()}: ${candidateName}`,
    body: optionalText(formData, "client_feedback") ?? optionalText(formData, "notes"),
    actor_id: userId,
  });
  const leadId = await opportunityLeadId(supabase, opportunityId);
  const interviewOn = whenIso ? (dateInTimeZone(whenIso, "America/New_York") ?? todayInWorkflowZone()) : todayInWorkflowZone();
  const interviewTime = when ? formatClock(when.slice(11, 16) || "12:00") : null;
  const feedback = optionalText(formData, "client_feedback");
  if (status === "Scheduled" || status === "Reschedule" || status === "Requested" || status === "Additional Interview") {
    const planned = await upsertAutomationTasks(supabase, userId, planInterviewDay({
      interviewId: savedId,
      opportunityId,
      leadId,
      interviewOn,
      clientName: optionalText(formData, "client_name"),
      interviewTime,
    }));
    if (planned?.error) return planned;
  }
  if (status === "Completed") {
    await cancelAutomationTypes(supabase, { opportunityId, types: ["interview_day"] });
    if (feedback) {
      await cancelAutomationTypes(supabase, {
        opportunityId,
        types: ["interview_feedback_1", "interview_feedback_2", "interview_review_7"],
      });
    } else {
      const planned = await upsertAutomationTasks(supabase, userId, [
        ...planInterviewFeedback({ interviewId: savedId, opportunityId, leadId, interviewOn }),
        ...planInterviewReview({ interviewId: savedId, opportunityId, leadId, interviewOn }),
      ]);
      if (planned?.error) return planned;
    }
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Interview saved." };
}

export async function saveContract(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const status = text(formData, "status");
  if (!isUuid(opportunityId) || !(CONTRACT_STATUSES as readonly string[]).includes(status)) return { error: "Choose an SOW status." };
  const headcount = optionalNumber(formData, "headcount");
  const rate = optionalNumber(formData, "billing_rate");
  if (Number.isNaN(headcount) || Number.isNaN(rate)) return { error: "Headcount must be a number." };
  const payload = {
    opportunity_id: opportunityId,
    status,
    candidate_selected_on: dateField(formData, "candidate_selected_on"),
    sow_preparation_on: dateField(formData, "sow_preparation_on"),
    sow_sent_on: dateField(formData, "sow_sent_on"),
    negotiation_status: optionalText(formData, "negotiation_status"),
    sow_signed_on: dateField(formData, "sow_signed_on"),
    expected_start_on: dateField(formData, "expected_start_on"),
    actual_start_on: dateField(formData, "actual_start_on"),
    billing_rate: rate,
    headcount,
    notes: optionalText(formData, "notes"),
  };
  const { data: existing } = await supabase.from("contracts").select("id, status").eq("opportunity_id", opportunityId).maybeSingle();
  const { error } = existing
    ? await supabase.from("contracts").update(payload).eq("opportunity_id", opportunityId)
    : await supabase.from("contracts").insert(payload);
  if (error) return { error: actionError(error) };
  if (headcount || rate) await supabase.from("opportunities").update({ headcount: headcount ?? undefined, billing_rate: rate ?? undefined }).eq("id", opportunityId);
  const previous = (existing as { status?: string } | null)?.status;
  if (status === "Sent" && previous !== "Sent") {
    await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "sow_sent", title: "SOW sent", actor_id: userId });
  } else if (status === "Signed" && previous !== "Signed") {
    await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "sow_signed", title: "SOW signed", actor_id: userId });
  }
  const leadId = await opportunityLeadId(supabase, opportunityId);
  const targetStart = dateField(formData, "expected_start_on");
  if (targetStart) {
    await supabase.from("opportunities").update({ target_start_on: targetStart }).eq("id", opportunityId);
  }
  if (status === "Signed") {
    await cancelAutomationTypes(supabase, { opportunityId, types: ["sow_signature", "sow_confirm_start"] });
    await upsertAutomationTasks(supabase, userId, planSignedSowTasks({
      opportunityId,
      leadId,
      targetStartOn: targetStart,
      signedOn: dateField(formData, "sow_signed_on") ?? todayInWorkflowZone(),
    }));
  } else if (targetStart) {
    await upsertAutomationTasks(supabase, userId, planSowSignature({ opportunityId, leadId, targetStartOn: targetStart }));
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/reporting");
  return { success: "SOW saved." };
}

export async function saveTargetStartDate(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const confirmed = text(formData, "start_confirmed") !== "no";
  const targetStart = confirmed ? dateField(formData, "target_start_on") : null;
  if (!isUuid(opportunityId)) return { error: "Opportunity not found." };
  if (confirmed && !targetStart) return { error: "Enter a target start date, or choose Not confirmed yet." };
  const { error } = await supabase.from("opportunities").update({ target_start_on: targetStart }).eq("id", opportunityId);
  if (error) return { error: actionError(error) };
  const leadId = await opportunityLeadId(supabase, opportunityId);
  if (targetStart) {
    await completeAutomationType(supabase, opportunityId, "sow_confirm_start");
    await upsertAutomationTasks(supabase, userId, planSowSignature({ opportunityId, leadId, targetStartOn: targetStart }));
    const contract = await supabase.from("contracts").select("status, sow_signed_on").eq("opportunity_id", opportunityId).maybeSingle();
    const contractRow = contract.data as { status?: string; sow_signed_on?: string | null } | null;
    if (contractRow?.status === "Signed") {
      await upsertAutomationTasks(supabase, userId, planSignedSowTasks({
        opportunityId,
        leadId,
        targetStartOn: targetStart,
        signedOn: contractRow.sow_signed_on?.slice(0, 10) || todayInWorkflowZone(),
      }));
    }
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: targetStart ? "Target start date saved." : "Target start date left unconfirmed." };
}

export async function startClient(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const startDate = dateField(formData, "start_date");
  const vas = optionalNumber(formData, "number_of_vas");
  const rate = optionalNumber(formData, "billing_rate");
  if (!isUuid(opportunityId) || !startDate || vas == null || Number.isNaN(vas)) {
    return { error: "Start date and number of VAs are required." };
  }
  const { error } = await supabase.rpc("start_client", {
    p_opportunity_id: opportunityId,
    p_start_date: startDate,
    p_number_of_vas: vas,
    p_billing_rate: rate == null || Number.isNaN(rate) ? 0 : rate,
    p_note: optionalText(formData, "note"),
  });
  if (error) return { error: actionError(error) };
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/reporting");
  return { success: "Client started." };
}

async function ensureOpportunityForBoard(
  leadId: string,
  opportunityId: string | null,
  stage: OpportunityStage,
  nextAction: string,
  nextActionDate: string,
  note?: string | null,
  extra?: Record<string, string>,
): Promise<{ error: string } | { id: string }> {
  const moveData = new FormData();
  moveData.set("stage", stage);
  moveData.set("next_action", nextAction);
  moveData.set("next_action_date", nextActionDate);
  moveData.set("waiting_on", STAGE_PLAYBOOK[stage].waitingOn);
  moveData.set("note", note ?? `Moved on the board to ${stage}`);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) moveData.set(key, value);
  }
  if (opportunityId && isUuid(opportunityId)) {
    moveData.set("opportunity_id", opportunityId);
    const moved = await moveStage({}, moveData);
    if (moved?.error) return { error: moved.error };
    return { id: opportunityId };
  }
  moveData.set("lead_id", leadId);
  const created = await dropLeadOnStage(moveData);
  if (created?.error) return { error: created.error };
  const { supabase } = await requireWriter();
  const existing = await supabase.from("opportunities").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const id = existing.data ? String((existing.data as { id: string }).id) : "";
  if (!isUuid(id)) return { error: "The opportunity could not be created." };
  return { id };
}

async function latestInterviewId(opportunityId: string) {
  const { supabase } = await requireWriter();
  const loaded = await supabase.from("interviews").select("id").eq("opportunity_id", opportunityId).order("interview_at", { ascending: false }).limit(1).maybeSingle();
  return loaded.data ? String((loaded.data as { id: string }).id) : null;
}

export async function loadBoardWorkContext(opportunityId: string | null) {
  await requireUser();
  if (!opportunityId || !isUuid(opportunityId)) return { candidates: [] as Array<{ id: string; name: string }>, interviewId: null as string | null, sentOn: null as string | null };
  const { supabase } = await requireUser();
  const [request, interview, opportunity] = await Promise.all([
    supabase.from("recruitment_requests").select("id, candidates(id, name, status)").eq("opportunity_id", opportunityId).maybeSingle(),
    supabase.from("interviews").select("id").eq("opportunity_id", opportunityId).order("interview_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("opportunities").select("talent_request_sent_on").eq("id", opportunityId).maybeSingle(),
  ]);
  const candidates = request.data
    ? (((request.data as { candidates?: { id: string; name: string; status: string }[] }).candidates ?? []).map((item) => ({ id: item.id, name: item.name })))
    : [];
  return {
    candidates,
    interviewId: interview.data ? String((interview.data as { id: string }).id) : null,
    sentOn: opportunity.data && !opportunity.error ? String((opportunity.data as { talent_request_sent_on?: string | null }).talent_request_sent_on ?? "") || null : null,
  };
}

export async function loadTalentRequestDraft(leadId: string, opportunityId: string | null): Promise<
  { error: string } | { body: string; missing: string[]; sentOn: string | null }
> {
  const { supabase } = await requireUser();
  const oppId = opportunityId && isUuid(opportunityId) ? opportunityId : null;
  const opportunity = oppId
    ? await supabase.from("opportunities").select("id, notes, headcount, billing_rate, talent_request_draft, talent_request_sent_on, companies(name), contacts(first_name, last_name)").eq("id", oppId).maybeSingle()
    : { data: null, error: null };
  if (opportunity.error) return { error: writeFailureMessage(opportunity.error, "The talent request could not be loaded.") };
  const call = oppId ? await supabase.from("strategy_calls").select("*").eq("opportunity_id", oppId).maybeSingle() : { data: null };
  const notes = oppId
    ? await supabase.from("notes").select("body").eq("opportunity_id", oppId).order("created_at", { ascending: false }).limit(5)
    : { data: [] };
  const lead = await supabase.from("leads").select("companies(name), contacts(first_name, last_name)").eq("id", leadId).maybeSingle();
  const opp = opportunity.data as Record<string, unknown> | null;
  const callRow = (call.data ?? {}) as Record<string, string | number | null>;
  const company = Array.isArray(opp?.companies) ? (opp?.companies as { name?: string }[])[0] : opp?.companies as { name?: string } | undefined;
  const contact = Array.isArray(opp?.contacts) ? (opp?.contacts as { first_name?: string; last_name?: string }[])[0] : opp?.contacts as { first_name?: string; last_name?: string } | undefined;
  const leadCompany = Array.isArray((lead.data as { companies?: { name?: string } } | null)?.companies)
    ? ((lead.data as { companies: { name?: string }[] }).companies[0])
    : (lead.data as { companies?: { name?: string } } | null)?.companies;
  const leadContact = Array.isArray((lead.data as { contacts?: { first_name?: string } } | null)?.contacts)
    ? ((lead.data as { contacts: { first_name?: string; last_name?: string }[] }).contacts[0])
    : (lead.data as { contacts?: { first_name?: string; last_name?: string } } | null)?.contacts;
  const savedNotes = Array.isArray(notes.data) ? notes.data.map((item) => String((item as { body?: string }).body ?? "")).filter(Boolean).join("\n") : "";
  const asText = (value: string | number | null | undefined) => (value == null || value === "" ? null : String(value));
  const facts: TalentFacts = {
    companyName: asText(callRow.company_name) || company?.name || leadCompany?.name || null,
    clientName: asText(callRow.client_name) || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || [leadContact?.first_name, leadContact?.last_name].filter(Boolean).join(" ") || null,
    role: asText(callRow.preferred_virtual_staff || callRow.ideal_candidate),
    headcount: typeof callRow.headcount_requirement === "number" ? callRow.headcount_requirement : (opp?.headcount as number | null) ?? null,
    responsibilities: asText(callRow.tasks || callRow.reason_for_hiring) || savedNotes || asText(opp?.notes as string | null),
    skills: asText(callRow.tools || callRow.ideal_candidate),
    schedule: asText(callRow.schedule),
    timezone: asText(callRow.timezone),
    budget: asText(callRow.budget) || (callRow.client_billing_rate != null ? String(callRow.client_billing_rate) : null) || (opp?.billing_rate != null ? String(opp.billing_rate) : null),
    experience: asText(callRow.ideal_candidate),
    special: asText(callRow.special_requirements || callRow.deal_breakers),
    startDate: asText(callRow.start_date_target),
  };
  const drafted = buildTalentRequestEmail(facts);
  const stored = opp?.talent_request_draft ? String(opp.talent_request_draft) : drafted.body;
  return {
    body: stored,
    missing: drafted.missing,
    sentOn: opp?.talent_request_sent_on ? String(opp.talent_request_sent_on) : null,
  };
}

export async function saveTalentRequestDraft(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const ensured = await ensureOpportunityForBoard(
    leadId,
    optionalText(formData, "opportunity_id"),
    "Recruitment",
    "Review the talent request draft",
    todayInWorkflowZone(),
    "Moved to Recruitment. Talent request is still a draft.",
  );
  if ("error" in ensured) return ensured;
  const body = optionalText(formData, "draft_body") ?? "";
  const { error } = await supabase.from("opportunities").update({ talent_request_draft: body }).eq("id", ensured.id);
  if (error) return { error: writeFailureMessage(error, "The talent request draft could not be saved.") };
  await supabase.from("activities").insert({
    opportunity_id: ensured.id,
    lead_id: leadId,
    type: "record_updated",
    title: "Talent request draft saved",
    body,
    actor_id: userId,
  });
  refresh(`/opportunities/${ensured.id}`, "/dashboard", "/opportunities");
  return { success: "Draft saved. It is not marked sent." };
}

export async function markTalentRequestSent(formData: FormData): Promise<ActionState> {
  const sentOn = dateField(formData, "sent_on") ?? todayInWorkflowZone();
  const saved = await saveTalentRequestDraft(formData);
  if (saved?.error) return saved;
  const { supabase, userId } = await requireWriter();
  const leadId = text(formData, "lead_id");
  const opportunityId = optionalText(formData, "opportunity_id");
  const loaded = opportunityId && isUuid(opportunityId)
    ? { id: opportunityId }
    : await (async () => {
      const row = await supabase.from("opportunities").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return { id: row.data ? String((row.data as { id: string }).id) : "" };
    })();
  if (!isUuid(loaded.id)) return { error: "Opportunity not found." };
  const current = await supabase.from("opportunities").select("talent_request_sent_on").eq("id", loaded.id).maybeSingle();
  if (current.error) return { error: writeFailureMessage(current.error, "The sent date could not be saved.") };
  const alreadySent = Boolean((current.data as { talent_request_sent_on?: string | null } | null)?.talent_request_sent_on);
  const existingRequest = await supabase.from("recruitment_requests").select("id").eq("opportunity_id", loaded.id).maybeSingle();
  if (alreadySent || existingRequest.data) {
    refresh(`/opportunities/${loaded.id}`, "/recruitment", "/dashboard");
    return { success: "Talent request was already marked sent. Follow-up dates were left unchanged." };
  }
  const { error: sentError } = await supabase.from("opportunities").update({ talent_request_sent_on: sentOn }).eq("id", loaded.id);
  if (sentError) return { error: writeFailureMessage(sentError, "The sent date could not be saved.") };
  const sendData = new FormData();
  sendData.set("opportunity_id", loaded.id);
  sendData.set("sent_on", sentOn);
  const sent = await sendToRecruitment({}, sendData);
  if (sent?.error && !/already exists/i.test(sent.error)) {
    await supabase.from("opportunities").update({ talent_request_sent_on: null }).eq("id", loaded.id);
    return sent;
  }
  if (sent?.error) {
    await cancelAutomationTypes(supabase, { opportunityId: loaded.id, types: ["call_notes", "call_talent_request"] });
  }
  await supabase.from("activities").insert({
    opportunity_id: loaded.id,
    type: "recruitment_requested",
    title: "Talent request marked sent",
    body: sentOn,
    actor_id: userId,
  });
  refresh(`/opportunities/${loaded.id}`, "/recruitment", "/dashboard");
  return { success: "Talent request marked sent. Recruitment follow-ups are on the calendar." };
}

export async function recordCandidateProfilesSentFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const sentOn = dateField(formData, "sent_on");
  const leadId = text(formData, "lead_id");
  const candidateIds = formData.getAll("candidate_id").map(String).filter(isUuid);
  const profileCount = resolvedProfileCount(candidateIds, optionalText(formData, "profile_count"));
  if (!sentOn) return { error: "When were the candidate profiles sent to the client?" };
  if (profileCount < 1) return { error: "Select at least one candidate or enter how many profiles were sent." };
  const ensured = await ensureOpportunityForBoard(
    leadId,
    optionalText(formData, "opportunity_id"),
    "Profiles Sent",
    "Follow Up on Candidate Profiles",
    sentOn,
    "Candidate profiles sent to the client",
  );
  if ("error" in ensured) return ensured;
  const request = await supabase.from("recruitment_requests").select("id").eq("opportunity_id", ensured.id).maybeSingle();
  const existing = await supabase
    .from("profile_batches")
    .select("id, sent_on, profile_count")
    .eq("opportunity_id", ensured.id)
    .order("sent_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return { error: actionError(existing.error) };
  const existingId = existing.data ? String((existing.data as { id: string }).id) : null;
  if (existingId) {
    const { error } = await supabase.from("profile_batches").update({
      sent_on: sentOn,
      profile_count: profileCount,
      notes: "Candidate profiles sent after recruitment",
    }).eq("id", existingId);
    if (error) return { error: actionError(error) };
  } else {
    const { error } = await supabase.from("profile_batches").insert({
      opportunity_id: ensured.id,
      recruitment_request_id: request.data ? String((request.data as { id: string }).id) : null,
      sent_on: sentOn,
      profile_count: profileCount,
      notes: "Candidate profiles sent after recruitment",
      created_by: userId,
    });
    if (error) return { error: actionError(error) };
    await supabase.from("activities").insert({
      opportunity_id: ensured.id,
      lead_id: leadId,
      type: "candidate_profile_sent",
      title: "Candidate profiles sent",
      body: `${profileCount} · ${sentOn}`,
      actor_id: userId,
    });
  }
  if (candidateIds.length > 0) {
    await supabase.from("candidates").update({ status: "Sent", date_sent_to_client: sentOn }).in("id", candidateIds);
  }
  const oppLeadId = await opportunityLeadId(supabase, ensured.id);
  await cancelAutomationTypes(supabase, { opportunityId: ensured.id, types: ["recruitment_progress"] });
  const planned = await upsertAutomationTasks(supabase, userId, planCandidateProfileFollowUp({ opportunityId: ensured.id, leadId: oppLeadId, sentOn }));
  if (planned?.error) return planned;
  refresh(`/opportunities/${ensured.id}`, "/dashboard", "/opportunities");
  return { success: "Candidate profile send recorded. Follow-ups use the sent date." };
}

export async function saveInterviewFromBoard(formData: FormData): Promise<ActionState> {
  const interviewOn = dateField(formData, "interview_on");
  const interviewTime = text(formData, "interview_time");
  if (!interviewOn || !/^\d{1,2}:\d{2}/.test(interviewTime)) return { error: "Enter the interview date and time." };
  const ensured = await ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    "Interview Scheduled",
    "Interview scheduled",
    interviewOn,
    "Interview scheduled",
  );
  if ("error" in ensured) return ensured;
  const next = new FormData();
  next.set("opportunity_id", ensured.id);
  next.set("status", "Scheduled");
  next.set("candidate_name", optionalText(formData, "candidate_name") ?? "Interview");
  next.set("client_name", optionalText(formData, "client_name") ?? "");
  next.set("interview_at", `${interviewOn}T${interviewTime}`);
  const existingId = await latestInterviewId(ensured.id);
  if (existingId) next.set("interview_id", existingId);
  return saveInterview({}, next);
}

export async function saveInterviewOutcomeFromBoard(formData: FormData): Promise<ActionState> {
  const selected = text(formData, "selected") === "yes";
  const interviewOn = dateField(formData, "interview_on") ?? todayInWorkflowZone();
  const candidateId = optionalText(formData, "candidate_id");
  let candidateName = optionalText(formData, "candidate_name");
  if (selected && !candidateId && !candidateName) {
    return { error: "Name the selected candidate." };
  }
  const stage = selected ? "Candidate Selected" : INTERVIEW_COMPLETE_STAGE;
  const ensured = await ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    stage,
    selected ? "Start the SOW with the selected candidate and rate" : "Collect client feedback and the next step",
    interviewOn,
    selected ? "Client selected a candidate" : "Interview completed. Awaiting client feedback.",
  );
  if ("error" in ensured) return ensured;
  if (selected && candidateId && !candidateName) {
    const { supabase } = await requireWriter();
    const loaded = await supabase.from("candidates").select("name").eq("id", candidateId).maybeSingle();
    candidateName = loaded.data ? String((loaded.data as { name?: string }).name ?? "") : candidateName;
  }
  const next = new FormData();
  next.set("opportunity_id", ensured.id);
  next.set("status", "Completed");
  next.set("candidate_name", candidateName ?? "Interview");
  next.set("client_name", optionalText(formData, "client_name") ?? "");
  next.set("interview_at", `${interviewOn}T12:00`);
  const existingId = await latestInterviewId(ensured.id);
  if (existingId) next.set("interview_id", existingId);
  if (candidateId) next.set("candidate_id", candidateId);
  if (selected) next.set("client_feedback", "Candidate selected");
  const saved = await saveInterview({}, next);
  if (saved?.error) return saved;
  if (selected && candidateId) {
    const { supabase } = await requireWriter();
    const request = await supabase.from("recruitment_requests").select("id").eq("opportunity_id", ensured.id).maybeSingle();
    const requestId = request.data ? String((request.data as { id: string }).id) : "";
    if (requestId) {
      const update = new FormData();
      update.set("candidate_id", candidateId);
      update.set("status", "Selected");
      update.set("opportunity_id", ensured.id);
      update.set("recruitment_id", requestId);
      await updateCandidate({}, update);
    }
  }
  return { success: selected ? "Candidate selection recorded." : "Interview marked complete. Feedback follow-ups are scheduled." };
}

export async function saveLostFromBoard(formData: FormData): Promise<ActionState> {
  const reason = text(formData, "lost_reason");
  if (!(LOST_REASONS as readonly string[]).includes(reason)) return { error: "Choose why this opportunity was lost." };
  const note = optionalText(formData, "note");
  return ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    "Lost",
    "Record why it was lost",
    todayInWorkflowZone(),
    note ?? reason,
    { lost_reason: note ? `${reason}. ${note}` : reason },
  ).then((result) => ("error" in result ? result : { success: "Marked lost." }));
}

export async function saveSowFromBoard(formData: FormData): Promise<ActionState> {
  const kind = text(formData, "kind");
  const targetStart = dateField(formData, "target_start_on");
  if (kind === "sow-signed") {
    const extra: Record<string, string> = {};
    const signedOn = dateField(formData, "sow_signed_on");
    if (targetStart) extra.target_start_on = targetStart;
    const ensured = await ensureOpportunityForBoard(
      text(formData, "lead_id"),
      optionalText(formData, "opportunity_id"),
      "SOW Signed",
      "Schedule onboarding and the start date",
      signedOn ?? todayInWorkflowZone(),
      signedOn ? `SOW signed ${signedOn}` : "SOW signed",
      extra,
    );
    return "error" in ensured ? ensured : { success: "SOW signed recorded." };
  }
  const extra: Record<string, string> = {};
  if (targetStart) extra.target_start_on = targetStart;
  const ensured = await ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    SOW_PREP_STAGE,
    "Finish the SOW and send it to the client",
    todayInWorkflowZone(),
    "Moved to SOW prep / sent",
    extra,
  );
  return "error" in ensured ? ensured : { success: "SOW stage saved." };
}

export async function saveNurtureFromBoard(formData: FormData): Promise<ActionState> {
  const note = optionalText(formData, "note");
  return ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    "On Hold / Nurture",
    "Set the date to revisit this client",
    todayInWorkflowZone(),
    note ?? "Moved to nurture",
    note ? { nurture_notes: note } : undefined,
  ).then((result) => ("error" in result ? result : { success: "Moved to nurture." }));
}

export async function saveClientStartFromBoard(formData: FormData): Promise<ActionState> {
  const ensured = await ensureOpportunityForBoard(
    text(formData, "lead_id"),
    optionalText(formData, "opportunity_id"),
    "Onboarding",
    "Complete onboarding and confirm the start",
    todayInWorkflowZone(),
    "Preparing client start",
  );
  if ("error" in ensured) return ensured;
  const start = new FormData();
  start.set("opportunity_id", ensured.id);
  start.set("start_date", text(formData, "start_date"));
  start.set("number_of_vas", text(formData, "number_of_vas"));
  return startClient({}, start);
}

export async function saveNextActionOverride(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const title = text(formData, "next_action");
  const dueOn = dateField(formData, "next_action_date");
  if (!isUuid(opportunityId) || !title) return { error: "Enter a next action." };
  const { error } = await supabase.from("opportunities").update({
    next_action: title,
    next_action_date: dueOn,
    next_action_manual: true,
  }).eq("id", opportunityId);
  if (error) return { error: writeFailureMessage(error, "The next action could not be saved.") };
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/opportunities");
  return { success: "Next action is set manually until you clear it." };
}

export async function clearNextActionOverride(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  if (!isUuid(opportunityId)) return { error: "Opportunity not found." };
  const { error } = await supabase.from("opportunities").update({ next_action_manual: false }).eq("id", opportunityId);
  if (error) return { error: writeFailureMessage(error, "The next-action override could not be cleared.") };
  const synced = await syncOpportunityNextAction(supabase, opportunityId);
  if (synced?.error) return synced;
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/opportunities");
  return { success: "Next action is following the earliest open task again." };
}

export async function addNote(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const body = text(formData, "body");
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  if (!body || (!opportunityId && !leadId)) return { error: "Write the note before saving." };
  const { error } = await supabase.from("notes").insert({ opportunity_id: opportunityId, lead_id: leadId, body, author_id: userId });
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, lead_id: leadId, type: "note_added", title: "Note added", body, actor_id: userId });
  refresh("/leads", opportunityId ? `/opportunities/${opportunityId}` : `/leads/${leadId}`, leadId ? `/leads/${leadId}` : "/leads");
  return { success: "Note added. Notes are kept, not overwritten." };
}

export async function logActivity(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const type = text(formData, "type");
  const title = text(formData, "title");
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  if (!(ACTIVITY_TYPES as readonly string[]).includes(type) || !title) return { error: "Choose an activity type and a title." };
  const occurred = text(formData, "occurred_at");
  const { error } = await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: type as ActivityType,
    title,
    body: optionalText(formData, "body"),
    actor_id: userId,
    occurred_at: occurred ? new Date(occurred).toISOString() : new Date().toISOString(),
  });
  if (error) return { error: actionError(error) };
  refresh(opportunityId ? `/opportunities/${opportunityId}` : `/leads/${leadId}`, "/dashboard");
  return { success: "Activity recorded." };
}

export async function addTask(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const title = text(formData, "title");
  if (!isUuid(opportunityId) || !title) return { error: "Task title is required." };
  const dueOn = dateField(formData, "due_on");
  const { error } = await supabase.from("tasks").insert({ opportunity_id: opportunityId, title, details: optionalText(formData, "details"), due_on: dueOn, owner_id: userId });
  if (error) return { error: actionError(error) };
  const { data: opportunity } = await supabase.from("opportunities").select("lead_id").eq("id", opportunityId).maybeSingle();
  const leadId = opportunity ? String((opportunity as { lead_id?: string }).lead_id ?? "") : "";
  if (dueOn) {
    const follow = await supabase.from("follow_ups").insert({
      opportunity_id: opportunityId,
      lead_id: isUuid(leadId) ? leadId : null,
      owner_id: userId,
      title,
      due_on: dueOn,
      notes: optionalText(formData, "details"),
    }).select("id").single();
    const followUpId = follow.data ? String((follow.data as { id: string }).id) : null;
    if (followUpId) {
      await supabase.from("tasks").update({ follow_up_id: followUpId }).eq("opportunity_id", opportunityId).eq("title", title).eq("status", "open");
    }
    await syncOpportunityNextAction(supabase, opportunityId);
  }
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/follow-ups");
  return { success: "Task added. It will show on the week calendar if it has a due date." };
}

export async function uploadDocument(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const opportunityId = text(formData, "opportunity_id");
  const file = formData.get("file");
  if (!isUuid(opportunityId) || !(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > 10 * 1024 * 1024) return { error: "Files must be 10 MB or smaller." };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${opportunityId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("opportunity-documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { error: actionError(uploadError) };
  const { error } = await supabase.from("documents").insert({ opportunity_id: opportunityId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: userId });
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "record_updated", title: `Document added: ${file.name}`, actor_id: userId });
  refresh(`/opportunities/${opportunityId}`);
  return { success: "Document uploaded." };
}

async function createLeadFromReviewRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
) {
  const id = text(formData, "record_id");
  if (!isUuid(id)) return { error: "That import row could not be found." };
  const { data, error } = await supabase.from("sendpilot_records").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "That import row could not be found." };
  const record = data as Record<string, string | null | boolean>;
  if (record.applied) return { error: "This row was already applied." };
  const classification = String(record.classification ?? "");
  const emailKey = normalizeEmail(String(record.email ?? ""));
  const linkedinKey = normalizeLinkedIn(String(record.linkedin_url ?? ""));
  const externalId = String(record.external_id ?? "").trim() || null;
  let suppressed = classification === "suppressed";
  if (emailKey) {
    const found = await supabase.from("sendpilot_suppressions").select("id").is("released_at", null).eq("email_key", emailKey).limit(1);
    if (found.data && found.data.length) suppressed = true;
  }
  if (!suppressed && linkedinKey) {
    const found = await supabase.from("sendpilot_suppressions").select("id").is("released_at", null).eq("linkedin_key", linkedinKey).limit(1);
    if (found.data && found.data.length) suppressed = true;
  }
  if (!suppressed && externalId) {
    const found = await supabase.from("sendpilot_suppressions").select("id").is("released_at", null).eq("sendpilot_lead_id", externalId).limit(1);
    if (found.data && found.data.length) suppressed = true;
  }
  if (suppressed && text(formData, "lift_suppression") !== "yes") {
    return { error: "This SendPilot lead was permanently deleted. Check the box to recreate it on purpose." };
  }
  if (suppressed) {
    if (emailKey) await supabase.from("sendpilot_suppressions").update({ released_at: new Date().toISOString(), released_by: userId }).is("released_at", null).eq("email_key", emailKey);
    if (linkedinKey) await supabase.from("sendpilot_suppressions").update({ released_at: new Date().toISOString(), released_by: userId }).is("released_at", null).eq("linkedin_key", linkedinKey);
    if (externalId) await supabase.from("sendpilot_suppressions").update({ released_at: new Date().toISOString(), released_by: userId }).is("released_at", null).eq("sendpilot_lead_id", externalId);
  }
  const companyName = String(record.company_name || "Unknown company");
  const { data: company } = await supabase.from("companies").select("id").ilike("name", companyName).maybeSingle();
  let companyId = company ? String((company as { id: string }).id) : "";
  if (!companyId) {
    const inserted = await supabase.from("companies").insert({ name: companyName }).select("id").single();
    if (inserted.error || !inserted.data) return { error: actionError(inserted.error) };
    companyId = String((inserted.data as { id: string }).id);
  }
  const contactInsert = await supabase.from("contacts").insert({
    company_id: companyId,
    first_name: record.first_name || String(record.full_name || "Unknown").split(" ")[0],
    last_name: record.last_name || "",
    email: record.email,
    phone: record.phone,
    linkedin_url: record.linkedin_url,
  }).select("id").single();
  if (contactInsert.error || !contactInsert.data) return { error: actionError(contactInsert.error) };
  const status = importedSendPilotStatus(String(record.sendpilot_status ?? ""));
  const leadInsert = await supabase.from("leads").insert({
    contact_id: (contactInsert.data as { id: string }).id,
    company_id: companyId,
    source: record.source || "sendpilot",
    sendpilot_status: status,
    sendpilot_status_raw: record.sendpilot_status,
    last_synced_at: new Date().toISOString(),
    requires_review: false,
  }).select("id").single();
  if (leadInsert.error || !leadInsert.data) return { error: actionError(leadInsert.error) };
  const leadId = (leadInsert.data as { id: string }).id;
  await supabase.from("sendpilot_records").update({ applied: true, review_required: false, matched_contact_id: (contactInsert.data as { id: string }).id, matched_lead_id: leadId }).eq("id", id);
  await supabase.from("activities").insert({ lead_id: leadId, type: "lead_imported", title: "Lead created from a reviewed import row", actor_id: userId });
  const auto = await maybeAutoCreateInterestedOpportunity(supabase, userId, leadId);
  if (auto.error) return { error: auto.error };
  if (auto.created && auto.id) {
    refresh("/reconciliation", "/leads", "/opportunities", "/dashboard");
    redirect(`/opportunities/${auto.id}`);
  }
  if (text(formData, "create_opportunity") === "yes") {
    const created = await startOpportunityForLead(supabase, userId, leadId);
    if (created && "error" in created && created.error) return created;
    return { leadId, opportunityId: created && "id" in created ? created.id : null };
  }
  return { leadId, opportunityId: null };
}

export async function createFromReviewedRecord(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const created = await createLeadFromReviewRecord(supabase, userId, formData);
  if ("error" in created && created.error) return created;
  if ("opportunityId" in created && created.opportunityId) {
    refresh("/reconciliation", "/leads", "/opportunities", "/dashboard");
    redirect(`/opportunities/${created.opportunityId}`);
  }
  if ("leadId" in created && created.leadId) {
    refresh("/reconciliation", "/leads");
    redirect(`/leads/${created.leadId}?notice=${encodeURIComponent("Lead added from import review.")}`);
  }
  return { error: "That import row could not be created." };
}

async function skipReviewRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  if (!isUuid(id)) return { error: "That import row could not be found." };
  const { data, error } = await supabase.from("sendpilot_records").select("id, applied, classification").eq("id", id).maybeSingle();
  if (error || !data) return { error: "That import row could not be found." };
  if ((data as { applied: boolean }).applied) return { error: "This row was already applied." };
  if (!bulkReviewEligible({ classification: String((data as { classification?: string | null }).classification ?? "") }, "skip")) {
    return { error: "This row cannot be bulk-skipped." };
  }
  const { error: updateError } = await supabase
    .from("sendpilot_records")
    .update({ review_required: false })
    .eq("id", id)
    .eq("applied", false);
  if (updateError) return { error: actionError(updateError) };
  return { ok: true as const };
}

export async function skipReviewedRecord(formData: FormData): Promise<void> {
  const { supabase } = await requireWriter();
  const skipped = await skipReviewRecord(supabase, text(formData, "record_id"));
  if ("error" in skipped && skipped.error) {
    redirect(`/reconciliation?notice=${encodeURIComponent(skipped.error)}`);
  }
  refresh("/reconciliation");
  redirect(`/reconciliation?notice=${encodeURIComponent("Import row skipped. It was not added to leads.")}`);
}

function selectedReviewIds(formData: FormData) {
  return [...new Set(formData.getAll("record_id").map((value) => String(value)).filter((id) => isUuid(id)))].slice(0, 100);
}

export async function bulkCreateReviewedRecords(formData: FormData): Promise<void> {
  const { supabase, userId } = await requireWriter();
  const ids = selectedReviewIds(formData);
  if (ids.length === 0) {
    redirect(`/reconciliation?notice=${encodeURIComponent("Select at least one review row.")}`);
  }
  const createOpportunity = text(formData, "create_opportunity") === "yes";
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const row = await supabase.from("sendpilot_records").select("classification").eq("id", id).maybeSingle();
    if (!bulkReviewEligible({ classification: String(row.data?.classification ?? "") }, "create")) {
      skipped += 1;
      continue;
    }
    const payload = new FormData();
    payload.set("record_id", id);
    if (createOpportunity) payload.set("create_opportunity", "yes");
    const result = await createLeadFromReviewRecord(supabase, userId, payload);
    if ("error" in result && result.error) failed += 1;
    else created += 1;
  }
  refresh("/reconciliation", "/leads", "/opportunities", "/dashboard");
  redirect(`/reconciliation?notice=${encodeURIComponent(`${created} lead${created === 1 ? "" : "s"} created. ${skipped} skipped. ${failed} failed.`)}`);
}

export async function bulkSkipReviewedRecords(formData: FormData): Promise<void> {
  const { supabase } = await requireWriter();
  const ids = selectedReviewIds(formData);
  if (ids.length === 0) {
    redirect(`/reconciliation?notice=${encodeURIComponent("Select at least one review row.")}`);
  }
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await skipReviewRecord(supabase, id);
    if ("error" in result && result.error) failed += 1;
    else skipped += 1;
  }
  refresh("/reconciliation");
  redirect(`/reconciliation?notice=${encodeURIComponent(`${skipped} row${skipped === 1 ? "" : "s"} skipped. ${failed} failed.`)}`);
}

export async function bulkApplyReviewedDuplicates(formData: FormData): Promise<void> {
  const { supabase, userId } = await requireWriter();
  const ids = selectedReviewIds(formData);
  if (ids.length === 0) {
    redirect(`/reconciliation?notice=${encodeURIComponent("Select at least one review row.")}`);
  }
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const payload = new FormData();
    payload.set("record_id", id);
    payload.set("tagging", "keep");
    const result = await applyDuplicateReviewRecord(supabase, userId, payload);
    if ("error" in result && result.error) {
      if (result.error.includes("not tied") || result.error.includes("could not be found")) skipped += 1;
      else failed += 1;
    } else {
      applied += 1;
    }
  }
  refresh("/reconciliation", "/leads");
  redirect(`/reconciliation?notice=${encodeURIComponent(`${applied} duplicate${applied === 1 ? "" : "s"} kept on the current lead. ${skipped} skipped. ${failed} failed.`)}`);
}

async function applyDuplicateReviewRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
) {
  const id = text(formData, "record_id");
  const tagging = parseDuplicateTagging(text(formData, "tagging"));
  if (!isUuid(id)) return { error: "That import row could not be found." };
  if (!tagging) return { error: "Choose whether to keep, replace, or clear the current SendPilot tag." };
  const { data, error } = await supabase.from("sendpilot_records").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "That import row could not be found." };
  const record = data as Record<string, string | null | boolean>;
  if (record.applied) return { error: "This row was already applied." };
  const matchedLeadId = String(record.matched_lead_id ?? "");
  const matchedContactId = String(record.matched_contact_id ?? "");
  let leadId = isUuid(matchedLeadId) ? matchedLeadId : "";
  if (!leadId && isUuid(matchedContactId)) {
    const found = await supabase.from("leads").select("id").eq("contact_id", matchedContactId).maybeSingle();
    leadId = found.data ? String((found.data as { id: string }).id) : "";
  }
  if (!isUuid(leadId)) return { error: "This duplicate is not tied to one current lead. Create a new lead or skip the row." };
  const importedRaw = String(record.sendpilot_status ?? "") || null;
  const patch = taggingPatch(tagging, importedSendPilotStatus(importedRaw), importedRaw);
  if (patch) {
    let updated = await supabase.from("leads").update({ ...patch, last_synced_at: new Date().toISOString() }).eq("id", leadId);
    if (updated.error && /not_interested_outcome/i.test(updated.error.message ?? "")) {
      const { not_interested_outcome: _unused, ...withoutOutcome } = patch;
      void _unused;
      updated = await supabase.from("leads").update({ ...withoutOutcome, last_synced_at: new Date().toISOString() }).eq("id", leadId);
    }
    if (updated.error) return { error: actionError(updated.error) };
    await supabase.from("activities").insert({
      lead_id: leadId,
      type: tagging === "clear" ? "sendpilot_status_changed" : "sendpilot_status_changed",
      title: tagging === "clear" ? "SendPilot tagging cleared from import review" : "SendPilot tagging replaced from import review",
      body: importedRaw ? `Imported tag: ${importedRaw}` : null,
      actor_id: userId,
    });
  } else {
    await supabase.from("activities").insert({
      lead_id: leadId,
      type: "record_updated",
      title: "Duplicate import row applied; current SendPilot tagging kept",
      actor_id: userId,
    });
  }
  await supabase.from("sendpilot_records").update({
    applied: true,
    review_required: false,
    matched_lead_id: leadId,
    matched_contact_id: isUuid(matchedContactId) ? matchedContactId : record.matched_contact_id,
  }).eq("id", id);
  const auto = await maybeAutoCreateInterestedOpportunity(supabase, userId, leadId);
  if (auto.error) return { error: auto.error };
  if (auto.created && auto.id) {
    refresh("/reconciliation", "/leads", "/opportunities", "/dashboard", `/leads/${leadId}`);
    if (text(formData, "create_opportunity") === "yes") redirect(`/opportunities/${auto.id}`);
    redirect(`/reconciliation?notice=${encodeURIComponent("Existing lead kept. Opportunity started.")}`);
  }
  if (text(formData, "create_opportunity") === "yes") {
    const open = await supabase.from("opportunities").select("id").eq("lead_id", leadId).in("status", ["active", "nurture", "on_hold"]).maybeSingle();
    if (open.data) return { leadId, opportunityId: String((open.data as { id: string }).id), alreadyOpen: true };
    const created = await startOpportunityForLead(supabase, userId, leadId);
    if (created && "error" in created && created.error) return created;
    return { leadId, opportunityId: created && "id" in created ? created.id : null };
  }
  return { leadId, opportunityId: null };
}

export async function applyReviewedDuplicate(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireWriter();
  const applied = await applyDuplicateReviewRecord(supabase, userId, formData);
  if ("error" in applied && applied.error) return applied;
  if ("alreadyOpen" in applied && applied.alreadyOpen && applied.opportunityId) {
    refresh("/reconciliation", "/leads", `/leads/${applied.leadId}`);
    redirect(`/opportunities/${applied.opportunityId}?notice=${encodeURIComponent("This lead already has an opportunity.")}`);
  }
  if ("opportunityId" in applied && applied.opportunityId) {
    refresh("/reconciliation", "/leads", "/opportunities", "/dashboard");
    redirect(`/opportunities/${applied.opportunityId}`);
  }
  if ("leadId" in applied && applied.leadId) {
    refresh("/reconciliation", "/leads", `/leads/${applied.leadId}`);
    redirect(`/reconciliation?notice=${encodeURIComponent("Existing lead kept. Import row closed.")}`);
  }
  return { error: "That import row could not be applied." };
}
