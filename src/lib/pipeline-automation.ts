import { addBusinessDays, addCalendarDays, previousFridayIfWeekend, todayInWorkflowZone } from "@/lib/workflow-dates";

export const AUTOMATION_TYPES = [
  "interested_follow_1",
  "interested_follow_2",
  "nurture_suggest",
  "nurture_check_30",
  "nurture_check_60",
  "nurture_check_90",
  "sales_profile_follow_1",
  "sales_profile_follow_2",
  "sales_profile_follow_3",
  "call_research",
  "call_slides",
  "call_day",
  "call_notes",
  "call_talent_request",
  "recruitment_progress",
  "candidate_profile_follow_1",
  "candidate_profile_follow_2",
  "awaiting_client_review",
  "interview_day",
  "interview_feedback_1",
  "interview_feedback_2",
  "interview_review_7",
  "sow_confirm_start",
  "sow_signature",
  "hr_communicated",
  "onboarding_prep",
  "trial_shift_1",
  "trial_shift_3",
  "trial_shift_5",
] as const;

export type AutomationType = (typeof AUTOMATION_TYPES)[number];

export type AutomationTask = {
  key: string;
  type: AutomationType;
  title: string;
  dueOn: string | null;
  pendingSchedule: boolean;
  urgent: boolean;
  opportunityId: string | null;
  leadId: string | null;
};

export type RecommendationKind = "suggest_nurture" | "awaiting_client_response" | "interview_review" | "missing_start_date";

export function automationKey(type: AutomationType, subjectId: string) {
  return `${type}:${subjectId}`;
}

function task(
  type: AutomationType,
  subjectId: string,
  title: string,
  dueOn: string | null,
  extra: Partial<Pick<AutomationTask, "opportunityId" | "leadId" | "urgent" | "pendingSchedule">> = {},
): AutomationTask {
  return {
    key: automationKey(type, subjectId),
    type,
    title,
    dueOn,
    pendingSchedule: extra.pendingSchedule ?? dueOn == null,
    urgent: extra.urgent ?? false,
    opportunityId: extra.opportunityId ?? null,
    leadId: extra.leadId ?? null,
  };
}

export function planInterestedFollowUps(input: { leadId: string; opportunityId: string | null; interestedOn: string }) {
  return [
    task("interested_follow_1", input.leadId, "First LinkedIn Follow-Up", addBusinessDays(input.interestedOn, 3), {
      leadId: input.leadId,
      opportunityId: input.opportunityId,
    }),
  ];
}

export function planSecondInterestedFollowUp(input: { leadId: string; opportunityId: string | null; firstCompletedOn: string }) {
  return [
    task("interested_follow_2", input.leadId, "Second LinkedIn Follow-Up", addBusinessDays(input.firstCompletedOn, 3), {
      leadId: input.leadId,
      opportunityId: input.opportunityId,
    }),
  ];
}

export function nurtureSuggestionDue(secondCompletedOn: string) {
  return addBusinessDays(secondCompletedOn, 3);
}

export function shouldSuggestNurture(input: { secondCompletedOn: string; today: string; responded: boolean }) {
  if (input.responded) return false;
  return input.today >= nurtureSuggestionDue(input.secondCompletedOn);
}

export function planNurtureCheckIns(input: { leadId: string; opportunityId: string | null; movedOn: string }) {
  return [
    task("nurture_check_30", input.leadId, "Nurture check-in (30 days)", addCalendarDays(input.movedOn, 30), input),
    task("nurture_check_60", input.leadId, "Nurture check-in (60 days)", addCalendarDays(input.movedOn, 60), input),
    task("nurture_check_90", input.leadId, "Nurture check-in (90 days)", addCalendarDays(input.movedOn, 90), input),
  ];
}

export function planSalesProfileFollowUps(input: { opportunityId: string; leadId: string | null; sentOn: string }) {
  return [
    task("sales_profile_follow_1", input.opportunityId, "First Profile Follow-Up", addBusinessDays(input.sentOn, 3), input),
    task("sales_profile_follow_2", input.opportunityId, "Second Profile Follow-Up", addBusinessDays(input.sentOn, 5), input),
    task("sales_profile_follow_3", input.opportunityId, "Final Profile Follow-Up", addBusinessDays(input.sentOn, 7), input),
  ];
}

export function planBookedCallTasks(input: {
  opportunityId: string;
  leadId: string | null;
  callOn: string;
  clientName?: string | null;
  companyName?: string | null;
  callTime?: string | null;
}) {
  const prep = addCalendarDays(input.callOn, -1);
  const who = [input.clientName?.trim(), input.companyName?.trim()].filter(Boolean).join(" · ");
  const when = [input.callOn, input.callTime?.trim()].filter(Boolean).join(" · ");
  const dayTitle = who ? `Sales call today — ${who} · ${when}` : `Sales call today — ${when}`;
  return [
    task("call_research", input.opportunityId, "Research the Company", prep, input),
    task("call_slides", input.opportunityId, "Prepare Sales Slides", prep, input),
    task("call_day", input.opportunityId, dayTitle, input.callOn, input),
  ];
}

export function planSalesCallCompleteTasks(input: { opportunityId: string; leadId: string | null; callOn: string }) {
  return [
    task("call_notes", input.opportunityId, "Review and Approve Meeting Notes", input.callOn, input),
    task("call_talent_request", input.opportunityId, "Send Talent Request to Recruitment", input.callOn, input),
  ];
}

export function defaultRecruitmentTarget(requestedOn: string, agreedDeadline?: string | null) {
  return agreedDeadline && /^\d{4}-\d{2}-\d{2}$/.test(agreedDeadline) ? agreedDeadline : addBusinessDays(requestedOn, 10);
}

export function planRecruitmentProgress(input: { opportunityId: string; leadId: string | null; requestedOn: string }) {
  return [
    task("recruitment_progress", input.opportunityId, "Recruitment Progress Check", addBusinessDays(input.requestedOn, 5), input),
  ];
}

export function planCandidateProfileFollowUp(input: { opportunityId: string; leadId: string | null; sentOn: string }) {
  return [
    task("candidate_profile_follow_1", input.opportunityId, "Follow Up on Candidate Profiles", addBusinessDays(input.sentOn, 3), input),
  ];
}

export function planSecondCandidateProfileFollowUp(input: { opportunityId: string; leadId: string | null; firstCompletedOn: string }) {
  return [
    task("candidate_profile_follow_2", input.opportunityId, "Second Candidate Profile Follow-Up", addBusinessDays(input.firstCompletedOn, 3), input),
  ];
}

export function planInterviewDay(input: {
  interviewId: string;
  opportunityId: string;
  leadId: string | null;
  interviewOn: string;
  clientName?: string | null;
  interviewTime?: string | null;
}) {
  const parts = [input.clientName?.trim(), input.interviewOn, input.interviewTime?.trim()].filter(Boolean);
  return [
    task("interview_day", input.interviewId, `Interview scheduled — ${parts.join(" · ")}`, input.interviewOn, {
      opportunityId: input.opportunityId,
      leadId: input.leadId,
    }),
  ];
}

export function planNurtureSuggestion(input: {
  subjectId: string;
  opportunityId: string | null;
  leadId: string | null;
  dueOn: string;
}) {
  return [
    task("nurture_suggest", input.subjectId, "Suggested action: Move to Nurture", input.dueOn, {
      opportunityId: input.opportunityId,
      leadId: input.leadId,
    }),
  ];
}

export function planAwaitingClientReview(input: { opportunityId: string; leadId: string | null }) {
  return [task("awaiting_client_review", input.opportunityId, "Needs review — awaiting client response", todayInWorkflowZone(), input)];
}

export function planInterviewReview(input: {
  interviewId: string;
  opportunityId: string;
  leadId: string | null;
  interviewOn: string;
}) {
  return [
    task("interview_review_7", input.interviewId, "Needs review — awaiting interview feedback", interviewReviewDue(input.interviewOn), {
      opportunityId: input.opportunityId,
      leadId: input.leadId,
    }),
  ];
}

export function planInterviewFeedback(input: { interviewId: string; opportunityId: string; leadId: string | null; interviewOn: string }) {
  return [
    task("interview_feedback_1", input.interviewId, "Follow Up on Interview Feedback", addBusinessDays(input.interviewOn, 2), {
      opportunityId: input.opportunityId,
      leadId: input.leadId,
    }),
  ];
}

export function planSecondInterviewFeedback(input: {
  interviewId: string;
  opportunityId: string;
  leadId: string | null;
  firstCompletedOn: string;
}) {
  return [
    task("interview_feedback_2", input.interviewId, "Second Interview Feedback Follow-Up", addBusinessDays(input.firstCompletedOn, 3), {
      opportunityId: input.opportunityId,
      leadId: input.leadId,
    }),
  ];
}

export function interviewReviewDue(interviewOn: string) {
  return addBusinessDays(interviewOn, 7);
}

export function planSowConfirmStart(input: { opportunityId: string; leadId: string | null }) {
  return [task("sow_confirm_start", input.opportunityId, "Confirm Client Start Date", todayInWorkflowZone(), input)];
}

export function planSowSignature(input: { opportunityId: string; leadId: string | null; targetStartOn: string }) {
  const raw = addCalendarDays(input.targetStartOn, -3);
  return [task("sow_signature", input.opportunityId, "Check SOW Signature", previousFridayIfWeekend(raw), input)];
}

export function planSignedSowTasks(input: {
  opportunityId: string;
  leadId: string | null;
  targetStartOn: string | null;
  signedOn: string;
}) {
  if (!input.targetStartOn) {
    return [
      task("hr_communicated", input.opportunityId, "Communicated with HR", null, { ...input, pendingSchedule: true }),
      task("onboarding_prep", input.opportunityId, "Onboarding Preparation", null, { ...input, pendingSchedule: true }),
    ];
  }
  const due = addBusinessDays(input.targetStartOn, -2);
  const late = due < input.signedOn;
  return [
    task("hr_communicated", input.opportunityId, "Communicated with HR", due, { ...input, urgent: late }),
    task("onboarding_prep", input.opportunityId, "Onboarding Preparation", due, { ...input, urgent: late }),
  ];
}

export function planTrialPeriodTasks(input: { opportunityId: string; leadId: string | null }) {
  return [
    task("trial_shift_1", input.opportunityId, "Client Check-In — First Shift", null, { ...input, pendingSchedule: true }),
    task("trial_shift_3", input.opportunityId, "Client Check-In — Third Shift", null, { ...input, pendingSchedule: true }),
    task("trial_shift_5", input.opportunityId, "Client Check-In — Fifth Shift", null, { ...input, pendingSchedule: true }),
  ];
}

const INTERESTED_RESPONSE_STATUSES = new Set(["Meeting Booked", "Meeting Complete", "Closed", "Not Interested", "Wrong Person"]);
const INTERESTED_RESPONSE_ACTIVITIES = new Set([
  "email_received",
  "profile_sent",
  "strategy_call_scheduled",
  "strategy_call_completed",
]);

export function leadHasResponded(input: {
  sendpilotStatus?: string | null;
  opportunityStage?: string | null;
  activityTypes?: string[];
}) {
  if (input.sendpilotStatus && INTERESTED_RESPONSE_STATUSES.has(input.sendpilotStatus)) return true;
  if (input.opportunityStage && input.opportunityStage !== "Interested" && input.opportunityStage !== "On Hold / Nurture") {
    return true;
  }
  return (input.activityTypes ?? []).some((type) => INTERESTED_RESPONSE_ACTIVITIES.has(type));
}

export function clientHasRespondedToProfiles(input: { clientResponse?: string | null; opportunityStage?: string | null }) {
  if (input.clientResponse && input.clientResponse.trim()) return true;
  const later = ["Strategy Call Proposed", "Strategy Call Scheduled", "Recruitment", "Interview Scheduled", "SOW Preparation", "SOW Signed", "Onboarding", "Won", "Lost"];
  return Boolean(input.opportunityStage && later.includes(input.opportunityStage));
}

export const CANCEL_ON_ADVANCE: Partial<Record<string, AutomationType[]>> = {
  "Email / Profile Preparation": ["interested_follow_1", "interested_follow_2", "nurture_suggest"],
  "Strategy Call Proposed": ["interested_follow_1", "interested_follow_2", "nurture_suggest", "sales_profile_follow_1", "sales_profile_follow_2", "sales_profile_follow_3"],
  "Strategy Call Scheduled": ["interested_follow_1", "interested_follow_2", "nurture_suggest", "sales_profile_follow_1", "sales_profile_follow_2", "sales_profile_follow_3"],
  Recruitment: ["call_research", "call_slides", "call_day", "call_notes"],
  "Profiles Sent": ["recruitment_progress"],
  "Interview Scheduled": ["candidate_profile_follow_1", "candidate_profile_follow_2", "awaiting_client_review"],
  "Interview Complete": ["interview_day"],
  "Candidate Selected": ["interview_feedback_1", "interview_feedback_2", "interview_review_7"],
  "On Hold / Nurture": ["interested_follow_1", "interested_follow_2", "nurture_suggest", "sales_profile_follow_1", "sales_profile_follow_2", "sales_profile_follow_3"],
  "SOW Signed": ["sow_signature", "sow_confirm_start"],
  Won: AUTOMATION_TYPES.slice(),
  Lost: AUTOMATION_TYPES.slice(),
};

export function typesToCancelOnStage(stage: string) {
  return CANCEL_ON_ADVANCE[stage] ?? [];
}
