"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";
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
  STAGE_PLAYBOOK,
  PROFILE_SEND_STAGE,
  BOOKED_CALL_STAGE,
  SALES_CALL_COMPLETE_STAGE,
  SALES_CALL_COMPLETE_TASKS,
  formatClock,
  WAITING_ON,
  addBusinessDays,
  importSourceFromFilename,
  mapImportRecords,
  stageRequiresNextAction,
  todayInTimeZone,
  type ActivityType,
  type OpportunityStage,
} from "@/lib/domain";
import { actionError } from "@/lib/errors";
import { getSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { dateField, optionalNumber, optionalText, settingsSchema, text, type ActionState } from "@/server/form";
import { requireUser } from "@/server/session";

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
  const next = text(formData, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
  const { supabase, userId } = await requireUser();
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
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("load_sample_workspace");
  if (error) redirect(`/dashboard?notice=${encodeURIComponent(actionError(error))}`);
  refresh("/dashboard", "/leads", "/opportunities", "/reconciliation", "/recruitment", "/analytics", "/follow-ups");
  redirect("/dashboard");
}

export async function createLead(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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

async function createOpportunityForLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  leadId: string,
  formData: FormData,
) {
  const { data: lead, error } = await supabase.from("leads").select("id, company_id, contact_id, companies(name), contacts(first_name, last_name)").eq("id", leadId).maybeSingle();
  if (error || !lead) return { error: "That lead could not be found." };
  const record = lead as { company_id: string; contact_id: string; companies: { name: string } | { name: string }[] | null };
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

export async function updateLeadStatus(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  refresh(`/leads/${leadId}`, "/leads", "/dashboard", "/reconciliation", "/opportunities", "/follow-ups");
  return { success: "Lead status saved." };
}

export async function dropLeadOnOutcome(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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

export async function createOpportunity(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const leadId = text(formData, "lead_id");
  if (!isUuid(leadId)) return { error: "Choose a lead." };
  const created = await createOpportunityForLead(supabase, userId, leadId, formData);
  if (!created) return { error: "The opportunity could not be created." };
  if ("error" in created) return created;
  refresh("/opportunities", "/leads", "/dashboard", "/reconciliation", `/leads/${leadId}`);
  redirect(`/opportunities/${created.id}`);
}

export async function updateNextAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const id = text(formData, "opportunity_id");
  const nextAction = text(formData, "next_action");
  const nextActionDate = dateField(formData, "next_action_date");
  const waiting = text(formData, "waiting_on");
  const risk = text(formData, "risk_level");
  if (!isUuid(id) || !nextAction || !nextActionDate) return { error: "Next action and due date are required." };
  if (!(WAITING_ON as readonly string[]).includes(waiting) || !(RISK_LEVELS as readonly string[]).includes(risk)) {
    return { error: "Choose who this is waiting on and a risk level." };
  }
  const { error } = await supabase.from("opportunities").update({ next_action: nextAction, next_action_date: nextActionDate, waiting_on: waiting, risk_level: risk }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: id, type: "record_updated", title: "Next action updated", body: `${nextAction} · ${nextActionDate}`, actor_id: userId });
  refresh(`/opportunities/${id}`, "/dashboard", "/opportunities");
  return { success: "Next action saved." };
}

export async function moveStage(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = text(formData, "opportunity_id");
  const stage = text(formData, "stage") as OpportunityStage;
  if (!isUuid(id) || !(OPPORTUNITY_STAGES as readonly string[]).includes(stage)) return { error: "Choose a stage." };
  const nextAction = optionalText(formData, "next_action");
  const nextActionDate = dateField(formData, "next_action_date");
  if (stageRequiresNextAction(stage) && (!nextAction || !nextActionDate)) {
    return { error: "Every active opportunity needs a next action and a due date." };
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
  refresh(`/opportunities/${id}`, "/dashboard", "/opportunities", "/analytics");
  return { success: `Moved to ${stage}. History was kept.` };
}

export async function dropOpportunityOnStage(formData: FormData): Promise<ActionState> {
  return moveStage({}, formData);
}

export async function dropLeadOnStage(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
  const leadId = text(formData, "lead_id");
  const email = text(formData, "client_email").toLowerCase();
  const sentOn = dateField(formData, "profile_sent_on");
  const callOn = dateField(formData, "call_on");
  const checkOne = dateField(formData, "check_back_1");
  const checkTwo = dateField(formData, "check_back_2");
  const notes = optionalText(formData, "notes");
  if (!isUuid(leadId) || !email || !sentOn || !checkOne || !checkTwo) {
    return { error: "Email, when the email/profiles were sent, and both check-back dates are required." };
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
  const nextAction = "Check back on the sent profiles";
  const nextActionDate = checkOne <= checkTwo ? checkOne : checkTwo;
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

  const followUps = [
    { due: checkOne, title: "Check back on the sent profiles (1 day from the call)" },
    { due: checkTwo, title: "Check back on the sent profiles (2 days from the call)" },
  ];
  for (const item of followUps) {
    await supabase.from("follow_ups").insert({
      opportunity_id: opportunityId,
      lead_id: leadId,
      owner_id: userId,
      title: item.title,
      due_on: item.due,
      notes,
    });
  }

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Profile send recorded. Check-backs are on the week calendar." };
}

export async function saveBookedSalesCallFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  await supabase.from("follow_ups").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    owner_id: userId,
    title,
    due_on: callOn,
    notes: `Booked sales call at ${clock}`,
  });
  await supabase.from("tasks").insert({
    opportunity_id: opportunityId,
    owner_id: userId,
    title,
    details: `Booked sales call at ${clock}`,
    due_on: callOn,
  });

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Sales call booked. It is on reminders, tasks, and the week calendar." };
}

export async function saveSalesCallCompleteFromBoard(formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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

  const { error: followError } = await supabase.from("follow_ups").insert(
    items.map((item) => ({
      opportunity_id: opportunityId,
      lead_id: leadId,
      owner_id: userId,
      title: item.title,
      due_on: item.due,
      notes,
    })),
  );
  if (followError) return { error: actionError(followError) };

  const { error: taskError } = await supabase.from("tasks").insert(
    items.map((item) => ({
      opportunity_id: opportunityId,
      owner_id: userId,
      title: item.title,
      details: notes ?? `After the sales call on ${callOn}`,
      due_on: item.due,
    })),
  );
  if (taskError) return { error: actionError(taskError) };

  refresh("/opportunities", "/leads", "/dashboard", "/follow-ups", `/leads/${leadId}`, `/opportunities/${opportunityId}`);
  return { success: "Sales call marked complete. The three tasks are on reminders and the week calendar." };
}

export async function createFollowUp(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  const title = text(formData, "title");
  const dueOn = dateField(formData, "due_on");
  if ((!opportunityId && !leadId) || !title || !dueOn) return { error: "A follow-up needs a title and a due date." };
  const { error } = await supabase.from("follow_ups").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    owner_id: userId,
    title,
    due_on: dueOn,
    reason: optionalText(formData, "reason"),
    notes: optionalText(formData, "notes"),
  });
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "follow_up_created",
    title: "Follow-up created",
    body: `${title} · ${dueOn}`,
    actor_id: userId,
  });
  if (opportunityId) {
    await supabase.from("opportunities").update({ next_action: title, next_action_date: dueOn }).eq("id", opportunityId);
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
  const { supabase, userId } = await requireUser();
  const id = text(formData, "follow_up_id");
  const opportunityId = optionalText(formData, "opportunity_id");
  const leadId = optionalText(formData, "lead_id");
  if (!isUuid(id)) return;
  const { error } = await supabase.from("follow_ups").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(`/follow-ups?notice=${encodeURIComponent(actionError(error))}`);
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    lead_id: leadId,
    type: "follow_up_completed",
    title: "Follow-up completed",
    actor_id: userId,
  });
  refresh("/follow-ups", "/dashboard", "/leads", opportunityId ? `/opportunities/${opportunityId}` : "/follow-ups", leadId ? `/leads/${leadId}` : "/leads");
}

export async function saveStrategyCall(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Strategy call saved." };
}

export async function sendToRecruitment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  const settings = await getSettings();
  const today = todayInTimeZone(settings.businessTimezone);
  const customTarget = dateField(formData, "target_on");
  const target = customTarget ?? addBusinessDays(today, settings.recruitmentTargetBusinessDays);
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
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
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
  refresh(`/recruitment/${requestId}`, `/opportunities/${opportunityId}`);
  return { success: "Candidate updated. Previous status stays in history." };
}

export async function recordProfileBatch(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
  const id = text(formData, "batch_id");
  const opportunityId = text(formData, "opportunity_id");
  const response = text(formData, "client_response");
  if (!isUuid(id) || !response) return { error: "Write the client response before saving." };
  const { error } = await supabase.from("profile_batches").update({ client_response: response }).eq("id", id);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({ opportunity_id: opportunityId, type: "client_response_received", title: "Client response received", body: response, actor_id: userId });
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Client response saved." };
}

export async function saveInterview(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const opportunityId = text(formData, "opportunity_id");
  const status = text(formData, "status");
  const candidateName = text(formData, "candidate_name");
  if (!isUuid(opportunityId) || !candidateName || !(INTERVIEW_STATUSES as readonly string[]).includes(status)) {
    return { error: "Candidate, status, and opportunity are required." };
  }
  const interviewId = optionalText(formData, "interview_id");
  const when = text(formData, "interview_at");
  const payload = {
    opportunity_id: opportunityId,
    candidate_id: optionalText(formData, "candidate_id"),
    candidate_name: candidateName,
    client_name: optionalText(formData, "client_name"),
    interview_at: when ? new Date(when).toISOString() : null,
    status,
    client_feedback: optionalText(formData, "client_feedback"),
    next_action: optionalText(formData, "next_action"),
    notes: optionalText(formData, "notes"),
  };
  const { error } = interviewId
    ? await supabase.from("interviews").update(payload).eq("id", interviewId)
    : await supabase.from("interviews").insert(payload);
  if (error) return { error: actionError(error) };
  await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    type: status === "Completed" ? "interview_completed" : "interview_scheduled",
    title: status === "Completed" ? `Interview completed: ${candidateName}` : `Interview ${status.toLowerCase()}: ${candidateName}`,
    body: optionalText(formData, "client_feedback") ?? optionalText(formData, "notes"),
    actor_id: userId,
  });
  refresh(`/opportunities/${opportunityId}`, "/dashboard");
  return { success: "Interview saved." };
}

export async function saveContract(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/analytics");
  return { success: "SOW saved." };
}

export async function startClient(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
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
  refresh(`/opportunities/${opportunityId}`, "/dashboard", "/analytics");
  return { success: "Client started." };
}

export async function addNote(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
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
  const { supabase, userId } = await requireUser();
  const opportunityId = text(formData, "opportunity_id");
  const title = text(formData, "title");
  if (!isUuid(opportunityId) || !title) return { error: "Task title is required." };
  const { error } = await supabase.from("tasks").insert({ opportunity_id: opportunityId, title, details: optionalText(formData, "details"), due_on: dateField(formData, "due_on"), owner_id: userId });
  if (error) return { error: actionError(error) };
  refresh(`/opportunities/${opportunityId}`);
  return { success: "Task added." };
}

export async function uploadDocument(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
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

export async function previewImport(formData: FormData) {
  await requireUser();
  const { supabase } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a CSV, XLS, or XLSX file." };
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    return { ok: false as const, error: "Use a CSV, XLS, or XLSX export. Other file types are not imported." };
  }
  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return { ok: false as const, error: "That workbook has no sheets." };
    const records = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const mapped = mapImportRecords(records);
    if (mapped.length === 0) return { ok: false as const, error: "That file has headings but no data rows." };
    if (mapped.length > 5000) return { ok: false as const, error: "Import up to 5,000 rows at a time." };
    const rows = mapped.map((row) => ({
      row_number: row.rowNumber,
      name: row.name,
      first_name: row.firstName,
      last_name: row.lastName,
      company: row.company,
      email: row.email,
      linkedin_url: row.linkedinUrl,
      phone: row.phone,
      sendpilot_status: row.sendpilotStatus,
      source: row.source,
      extra: row.extra,
    }));
    const payload = { filename: file.name, source: importSourceFromFilename(file.name), rows };
    const { data, error } = await supabase.rpc("preview_sendpilot_import", { payload });
    if (error) return { ok: false as const, error: actionError(error) };
    return { ok: true as const, preview: data as PreviewPayload, rows, filename: file.name, source: payload.source };
  } catch (error) {
    console.error(error);
    return { ok: false as const, error: "The file could not be read. Export it again as CSV or XLSX and retry." };
  }
}

type PreviewPayload = {
  total: number;
  new: number;
  existing: number;
  updated: number;
  possible_duplicates: number;
  unmatched: number;
  review: number;
  rows: Array<Record<string, string | null>>;
};

export async function applyImport(input: { filename: string; source: string; rows: unknown[] }) {
  const { supabase } = await requireUser();
  const parsed = z.object({
    filename: z.string().min(1).max(200),
    source: z.enum(["csv", "xls", "xlsx"]),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "The import confirmation was incomplete. Upload the file again." };
  const { data, error } = await supabase.rpc("apply_sendpilot_import", { payload: parsed.data });
  if (error) return { ok: false as const, error: actionError(error) };
  refresh("/leads", "/reconciliation", "/dashboard");
  return { ok: true as const, result: data as { sync_id: string; total: number; new: number; existing: number; updated: number; possible_duplicates: number; unmatched: number; errors: number } };
}

export async function createFromReviewedRecord(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const id = text(formData, "record_id");
  if (!isUuid(id)) return { error: "That import row could not be found." };
  if (text(formData, "confirm") !== "yes") return { error: "Confirm that this should be created even if it may duplicate an existing contact." };
  const { data, error } = await supabase.from("sendpilot_records").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "That import row could not be found." };
  const record = data as Record<string, string | null | boolean>;
  if (record.applied) return { error: "This row was already applied." };
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
  const status = (SENDPILOT_STATUSES as readonly string[]).includes(String(record.sendpilot_status)) ? record.sendpilot_status : null;
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
  await supabase.from("sendpilot_records").update({ applied: true, review_required: false, matched_contact_id: (contactInsert.data as { id: string }).id, matched_lead_id: (leadInsert.data as { id: string }).id }).eq("id", id);
  await supabase.from("activities").insert({ lead_id: (leadInsert.data as { id: string }).id, type: "lead_imported", title: "Lead created from a reviewed import row", actor_id: userId });
  refresh("/reconciliation", "/leads");
  redirect(`/leads/${(leadInsert.data as { id: string }).id}`);
}
