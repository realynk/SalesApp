import type { SupabaseClient } from "@supabase/supabase-js";
import {
  automationKey,
  clientHasRespondedToProfiles,
  leadHasResponded,
  planAwaitingClientReview,
  planNurtureSuggestion,
  planSecondCandidateProfileFollowUp,
  planSecondInterestedFollowUp,
  planSecondInterviewFeedback,
  typesToCancelOnStage,
  type AutomationTask,
  type AutomationType,
} from "@/lib/pipeline-automation";
import { writeFailureMessage } from "@/lib/migration-columns";
import { addBusinessDays, todayInWorkflowZone } from "@/lib/workflow-dates";

type Db = SupabaseClient;

function asRow(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function upsertAutomationTasks(supabase: Db, ownerId: string | null, planned: AutomationTask[]) {
  for (const item of planned) {
    const followPayload = {
      opportunity_id: item.opportunityId,
      lead_id: item.leadId,
      owner_id: ownerId,
      title: item.title,
      due_on: item.dueOn ?? todayInWorkflowZone(),
      automation_key: item.key,
      automation_type: item.type,
      urgent: item.urgent,
      pending_schedule: item.pendingSchedule,
      notes: item.pendingSchedule ? "Pending schedule" : item.urgent ? "Urgent — needs review" : null,
    };
    const existingFollow = await supabase.from("follow_ups").select("id, status").eq("automation_key", item.key).maybeSingle();
    const followRow = asRow(existingFollow.data);
    let followUpId = followRow?.id ? String(followRow.id) : null;
    if (followUpId) {
      if (followRow?.status === "completed" || followRow?.status === "cancelled") {
        // Keep completed/cancelled history. Only refresh due dates on still-open rows.
      } else {
        await supabase.from("follow_ups").update({
          title: followPayload.title,
          due_on: followPayload.due_on,
          urgent: followPayload.urgent,
          pending_schedule: followPayload.pending_schedule,
          opportunity_id: item.opportunityId,
          lead_id: item.leadId,
        }).eq("id", followUpId);
      }
    } else {
      const inserted = await supabase.from("follow_ups").insert({ ...followPayload, status: "open" }).select("id").single();
      if (inserted.error) {
        return { error: writeFailureMessage(inserted.error, "The follow-up could not be saved.") };
      }
      followUpId = inserted.data ? String((inserted.data as { id: string }).id) : null;
    }

    const taskPayload = {
      opportunity_id: item.opportunityId,
      owner_id: ownerId,
      title: item.title,
      details: item.pendingSchedule ? "Pending schedule" : item.urgent ? "Urgent — needs review" : item.title,
      due_on: item.dueOn,
      automation_key: item.key,
      automation_type: item.type,
      follow_up_id: followUpId,
      urgent: item.urgent,
      pending_schedule: item.pendingSchedule,
    };
    const existingTask = await supabase.from("tasks").select("id, status").eq("automation_key", item.key).maybeSingle();
    const taskRow = asRow(existingTask.data);
    if (taskRow?.id) {
      if (taskRow.status === "open") {
        await supabase.from("tasks").update({
          title: taskPayload.title,
          details: taskPayload.details,
          due_on: taskPayload.due_on,
          follow_up_id: followUpId,
          urgent: taskPayload.urgent,
          pending_schedule: taskPayload.pending_schedule,
        }).eq("id", String(taskRow.id));
      }
    } else {
      const insertedTask = await supabase.from("tasks").insert({ ...taskPayload, status: "open" });
      if (insertedTask.error) {
        return { error: writeFailureMessage(insertedTask.error, "The task could not be saved.") };
      }
    }
  }
  const opportunityIds = [...new Set(planned.map((item) => item.opportunityId).filter(Boolean))] as string[];
  for (const opportunityId of opportunityIds) {
    const synced = await syncOpportunityNextAction(supabase, opportunityId);
    if (synced?.error) return synced;
  }
}

export const LEAD_RESPONSE_AUTOMATION_TYPES: AutomationType[] = [
  "interested_follow_1",
  "interested_follow_2",
  "nurture_suggest",
];

function scopedId(value: string | null | undefined) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function rowIds(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((row) => String((row as { id?: string }).id ?? ""))
    .filter((id) => Boolean(scopedId(id)));
}

async function cancelOpenAutomationRows(
  supabase: Db,
  table: "follow_ups" | "tasks",
  patch: Record<string, unknown>,
  types: AutomationType[],
  column: "opportunity_id" | "lead_id" | "automation_key" | "follow_up_id",
  values: string[],
) {
  if (values.length === 0) return;
  let query = supabase.from(table).update(patch).eq("status", "open");
  if (column === "automation_key" || column === "follow_up_id") {
    query = query.in(column, values);
  } else {
    query = query.in("automation_type", types).in(column, values);
  }
  await query;
}

export async function cancelAutomationTypes(
  supabase: Db,
  input: { opportunityId?: string | null; leadId?: string | null; types: AutomationType[] },
) {
  if (input.types.length === 0) return;
  const opportunityId = scopedId(input.opportunityId);
  const leadId = scopedId(input.leadId);
  if (!opportunityId && !leadId) return;

  const followPatch = { status: "cancelled", completed_at: new Date().toISOString() };
  const taskPatch = { status: "cancelled" };

  if (opportunityId) {
    await cancelOpenAutomationRows(supabase, "follow_ups", followPatch, input.types, "opportunity_id", [opportunityId]);
    await cancelOpenAutomationRows(supabase, "tasks", taskPatch, input.types, "opportunity_id", [opportunityId]);
    return;
  }

  const leadFollows = await supabase
    .from("follow_ups")
    .select("id")
    .eq("status", "open")
    .in("automation_type", input.types)
    .eq("lead_id", leadId);
  const followIds = new Set(rowIds(leadFollows.data));

  const opportunities = await supabase.from("opportunities").select("id").eq("lead_id", leadId);
  const opportunityIds = rowIds(opportunities.data);
  if (opportunityIds.length > 0) {
    const opportunityFollows = await supabase
      .from("follow_ups")
      .select("id")
      .eq("status", "open")
      .in("automation_type", input.types)
      .in("opportunity_id", opportunityIds);
    for (const id of rowIds(opportunityFollows.data)) followIds.add(id);
  }

  await cancelOpenAutomationRows(supabase, "follow_ups", followPatch, input.types, "lead_id", [leadId as string]);
  if (opportunityIds.length > 0) {
    await cancelOpenAutomationRows(supabase, "follow_ups", followPatch, input.types, "opportunity_id", opportunityIds);
    await cancelOpenAutomationRows(supabase, "tasks", taskPatch, input.types, "opportunity_id", opportunityIds);
  }
  await cancelOpenAutomationRows(
    supabase,
    "tasks",
    taskPatch,
    input.types,
    "automation_key",
    input.types.map((type) => automationKey(type, leadId as string)),
  );
  await cancelOpenAutomationRows(supabase, "tasks", taskPatch, input.types, "follow_up_id", [...followIds]);
}

export async function cancelInterestedAutomationForLead(supabase: Db, leadId: string | null | undefined) {
  return cancelAutomationTypes(supabase, { leadId, types: LEAD_RESPONSE_AUTOMATION_TYPES });
}

export async function completeAutomationType(supabase: Db, opportunityId: string, type: AutomationType) {
  const loaded = await supabase
    .from("follow_ups")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .eq("automation_type", type)
    .eq("status", "open");
  for (const row of Array.isArray(loaded.data) ? loaded.data : []) {
    await completeLinkedTaskRecords(supabase, String((row as { id: string }).id));
  }
}

export async function completeLinkedTaskRecords(supabase: Db, followUpId: string) {
  await supabase.from("follow_ups").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", followUpId);
  await supabase.from("tasks").update({ status: "done" }).eq("follow_up_id", followUpId).eq("status", "open");
  const follow = await supabase.from("follow_ups").select("automation_key").eq("id", followUpId).maybeSingle();
  const key = follow.data ? String((follow.data as { automation_key?: string | null }).automation_key ?? "") : "";
  if (key) {
    await supabase.from("tasks").update({ status: "done" }).eq("automation_key", key).eq("status", "open");
  }
}

export async function afterFollowUpCompleted(
  supabase: Db,
  ownerId: string | null,
  followUpId: string,
) {
  const loaded = await supabase
    .from("follow_ups")
    .select("id, automation_type, automation_key, opportunity_id, lead_id, completed_at")
    .eq("id", followUpId)
    .maybeSingle();
  const row = asRow(loaded.data);
  if (!row) return;
  const type = String(row.automation_type ?? "") as AutomationType;
  const opportunityId = row.opportunity_id ? String(row.opportunity_id) : null;
  const leadId = row.lead_id ? String(row.lead_id) : null;
  const completedOn = String(row.completed_at ?? "").slice(0, 10) || todayInWorkflowZone();

  if (type === "interested_follow_1" && leadId) {
    const responded = await loadLeadResponded(supabase, leadId, opportunityId);
    if (!responded) {
      await upsertAutomationTasks(supabase, ownerId, planSecondInterestedFollowUp({ leadId, opportunityId, firstCompletedOn: completedOn }));
    }
  }
  if (type === "interested_follow_2" && leadId) {
    const responded = await loadLeadResponded(supabase, leadId, opportunityId);
    if (!responded) {
      await upsertAutomationTasks(supabase, ownerId, planNurtureSuggestion({
        subjectId: leadId,
        opportunityId,
        leadId,
        dueOn: addBusinessDays(completedOn, 3),
      }));
    }
  }
  if (type === "sales_profile_follow_3" && opportunityId) {
    const responded = await loadClientProfileResponse(supabase, opportunityId);
    if (!responded) {
      await upsertAutomationTasks(supabase, ownerId, planNurtureSuggestion({
        subjectId: opportunityId,
        opportunityId,
        leadId,
        dueOn: completedOn,
      }));
    }
  }
  if (type === "candidate_profile_follow_1" && opportunityId) {
    const responded = await loadClientProfileResponse(supabase, opportunityId);
    if (!responded) {
      await upsertAutomationTasks(supabase, ownerId, planSecondCandidateProfileFollowUp({
        opportunityId,
        leadId,
        firstCompletedOn: completedOn,
      }));
    }
  }
  if (type === "candidate_profile_follow_2" && opportunityId) {
    const responded = await loadClientProfileResponse(supabase, opportunityId);
    if (!responded) {
      await upsertAutomationTasks(supabase, ownerId, planAwaitingClientReview({ opportunityId, leadId }));
    }
  }
  if (type === "interview_feedback_1" && opportunityId) {
    const key = String(row.automation_key ?? "");
    const interviewId = key.includes(":") ? key.slice(key.indexOf(":") + 1) : followUpId;
    const feedback = await loadInterviewFeedback(supabase, opportunityId);
    if (!feedback) {
      await upsertAutomationTasks(supabase, ownerId, planSecondInterviewFeedback({
        interviewId,
        opportunityId,
        leadId,
        firstCompletedOn: completedOn,
      }));
    }
  }
}

export async function syncOpportunityNextAction(supabase: Db, opportunityId: string | null | undefined) {
  if (!opportunityId) return;
  const loaded = await supabase.from("opportunities").select("next_action_manual").eq("id", opportunityId).maybeSingle();
  if (loaded.error && !/next_action_manual|PGRST204/i.test(`${loaded.error.code ?? ""} ${loaded.error.message ?? ""}`)) {
    return { error: writeFailureMessage(loaded.error, "Next action could not be updated.") };
  }
  const row = asRow(loaded.data);
  if (row?.next_action_manual === true) return;
  const follows = await supabase
    .from("follow_ups")
    .select("title, due_on")
    .eq("opportunity_id", opportunityId)
    .eq("status", "open")
    .order("due_on")
    .limit(1);
  const first = Array.isArray(follows.data) ? follows.data[0] : null;
  if (first) {
    await supabase.from("opportunities").update({
      next_action: String((first as { title?: string }).title ?? "Next action"),
      next_action_date: String((first as { due_on?: string }).due_on ?? ""),
    }).eq("id", opportunityId);
    return;
  }
  const current = await supabase.from("opportunities").select("next_action").eq("id", opportunityId).maybeSingle();
  const title = current.data ? String((current.data as { next_action?: string | null }).next_action ?? "") : "";
  if (!title) return;
  const closed = await supabase
    .from("follow_ups")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .eq("title", title)
    .in("status", ["completed", "cancelled"])
    .limit(1);
  if (Array.isArray(closed.data) && closed.data.length > 0) {
    await supabase.from("opportunities").update({ next_action: null, next_action_date: null }).eq("id", opportunityId);
  }
}

export async function opportunityLeadId(supabase: Db, opportunityId: string) {
  const loaded = await supabase.from("opportunities").select("lead_id").eq("id", opportunityId).maybeSingle();
  const id = loaded.data ? String((loaded.data as { lead_id?: string }).lead_id ?? "") : "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function loadLeadResponded(supabase: Db, leadId: string, opportunityId: string | null) {
  const lead = await supabase.from("leads").select("sendpilot_status").eq("id", leadId).maybeSingle();
  const activities = await supabase.from("activities").select("type").eq("lead_id", leadId).limit(50);
  const opportunity = opportunityId
    ? await supabase.from("opportunities").select("stage").eq("id", opportunityId).maybeSingle()
    : { data: null };
  return leadHasResponded({
    sendpilotStatus: lead.data ? String((lead.data as { sendpilot_status?: string | null }).sendpilot_status ?? "") : null,
    opportunityStage: opportunity.data ? String((opportunity.data as { stage?: string }).stage ?? "") : null,
    activityTypes: Array.isArray(activities.data) ? activities.data.map((item) => String((item as { type?: string }).type ?? "")) : [],
  });
}

async function loadClientProfileResponse(supabase: Db, opportunityId: string) {
  const opportunity = await supabase.from("opportunities").select("stage").eq("id", opportunityId).maybeSingle();
  const batch = await supabase.from("profile_batches").select("client_response").eq("opportunity_id", opportunityId).order("sent_on", { ascending: false }).limit(1).maybeSingle();
  const stage = opportunity.data ? String((opportunity.data as { stage?: string }).stage ?? "") : null;
  const response = batch.data ? String((batch.data as { client_response?: string | null }).client_response ?? "") : "";
  return clientHasRespondedToProfiles({ clientResponse: response, opportunityStage: stage });
}

async function loadInterviewFeedback(supabase: Db, opportunityId: string) {
  const interview = await supabase
    .from("interviews")
    .select("client_feedback, status")
    .eq("opportunity_id", opportunityId)
    .order("interview_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = asRow(interview.data);
  if (!row) return false;
  if (String(row.client_feedback ?? "").trim()) return true;
  return String(row.status ?? "") === "Completed" && Boolean(String(row.client_feedback ?? "").trim());
}

export async function cancelTypesForStage(
  supabase: Db,
  input: { opportunityId?: string | null; leadId?: string | null; stage: string },
) {
  await cancelAutomationTypes(supabase, {
    opportunityId: input.opportunityId,
    leadId: input.leadId,
    types: typesToCancelOnStage(input.stage),
  });
}
