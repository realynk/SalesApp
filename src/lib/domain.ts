export const SENDPILOT_STATUSES = [
  "Interested",
  "Not Interested",
  "Meeting Booked",
  "Meeting Complete",
  "Closed",
  "Wrong Person",
  "No Response",
] as const;

export type SendPilotStatus = (typeof SENDPILOT_STATUSES)[number];

export const OPPORTUNITY_STAGES = [
  "Interested",
  "Email / Profile Preparation",
  "Strategy Call Proposed",
  "Strategy Call Scheduled",
  "Strategy Call Complete",
  "Requirements Captured",
  "Recruitment",
  "Profiles Ready",
  "Profiles Sent",
  "Client Review",
  "Interview Scheduled",
  "Interview Complete",
  "Candidate Selected",
  "SOW Preparation",
  "SOW Sent",
  "SOW Negotiation",
  "SOW Signed",
  "Onboarding",
  "Client Started",
  "Won",
  "Lost",
  "On Hold / Nurture",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STATUSES = ["active", "won", "lost", "nurture", "on_hold"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const WAITING_ON = ["none", "client", "recruitment", "internal", "candidate"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

export const RECRUITMENT_STATUSES = [
  "Not Started",
  "Sourcing",
  "Screening",
  "Profiles Ready",
  "Sent to Client",
  "Client Reviewing",
  "Interview Requested",
  "Candidate Selected",
  "No Suitable Candidate",
  "On Hold",
] as const;

export const CANDIDATE_STATUSES = [
  "Sourcing",
  "Screening",
  "Profile Ready",
  "Sent",
  "Shortlisted",
  "Interview",
  "Selected",
  "Rejected",
  "Withdrawn",
] as const;

export const INTERVIEW_STATUSES = [
  "Requested",
  "Scheduled",
  "Completed",
  "Client Reviewing",
  "Additional Interview",
  "Selected",
  "Rejected",
  "No-show",
  "Reschedule",
] as const;

export const CONTRACT_STATUSES = ["Preparing", "Sent", "Negotiating", "Signed", "Cancelled"] as const;

export const NURTURE_REASON_SUGGESTIONS = [
  "Timing",
  "Budget",
  "Already staffed",
  "Not currently hiring",
  "Revisit later",
  "Other",
] as const;

export const NOT_INTERESTED_OUTCOMES = [
  "Nurture",
  "No longer in the company",
  "Not the decision maker",
  "Not relevant",
  "Stop",
] as const;

export type NotInterestedOutcome = (typeof NOT_INTERESTED_OUTCOMES)[number];

export const NOT_INTERESTED_INTAKE = "Not Interested";

export type NotInterestedColumn = NotInterestedOutcome | typeof NOT_INTERESTED_INTAKE;

export function notInterestedOutcome(value?: string | null): NotInterestedOutcome | null {
  if (value && (NOT_INTERESTED_OUTCOMES as readonly string[]).includes(value)) return value as NotInterestedOutcome;
  return null;
}

export function notInterestedColumn(value?: string | null): NotInterestedColumn {
  return notInterestedOutcome(value) ?? NOT_INTERESTED_INTAKE;
}

export const ACTIVITY_TYPES = [
  "lead_imported",
  "sendpilot_status_changed",
  "lead_became_interested",
  "email_received",
  "profile_sent",
  "proposal_sent",
  "strategy_call_scheduled",
  "strategy_call_completed",
  "requirements_captured",
  "recruitment_requested",
  "candidate_added",
  "candidate_profile_sent",
  "client_response_received",
  "interview_scheduled",
  "interview_completed",
  "candidate_selected",
  "sow_sent",
  "sow_signed",
  "client_started",
  "follow_up_created",
  "follow_up_completed",
  "note_added",
  "stage_changed",
  "opportunity_created",
  "record_updated",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  lead_imported: "Lead imported",
  sendpilot_status_changed: "SendPilot status changed",
  lead_became_interested: "Lead became interested",
  email_received: "Email received",
  profile_sent: "Profile sent",
  proposal_sent: "Proposal sent",
  strategy_call_scheduled: "Strategy call scheduled",
  strategy_call_completed: "Strategy call completed",
  requirements_captured: "Requirements captured",
  recruitment_requested: "Recruitment requested",
  candidate_added: "Candidate added",
  candidate_profile_sent: "Candidate profile sent",
  client_response_received: "Client response received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  candidate_selected: "Candidate selected",
  sow_sent: "SOW sent",
  sow_signed: "SOW signed",
  client_started: "Client started",
  follow_up_created: "Follow-up created",
  follow_up_completed: "Follow-up completed",
  note_added: "Note added",
  stage_changed: "Stage changed",
  opportunity_created: "Opportunity created",
  record_updated: "Record updated",
};

const TERMINAL_STAGES = new Set<OpportunityStage>(["Won", "Lost", "Client Started"]);

export function stageRequiresNextAction(stage: OpportunityStage) {
  return !TERMINAL_STAGES.has(stage);
}

export const STAGE_PLAYBOOK: Record<
  OpportunityStage,
  { nextAction: string; waitingOn: WaitingOn }
> = {
  Interested: {
    nextAction: "Confirm interest and prepare the client profile",
    waitingOn: "internal",
  },
  "Email / Profile Preparation": {
    nextAction: "Send the introduction profile and propose a strategy call",
    waitingOn: "internal",
  },
  "Strategy Call Proposed": {
    nextAction: "Confirm the strategy call time with the client",
    waitingOn: "client",
  },
  "Strategy Call Scheduled": {
    nextAction: "Send the meeting notes",
    waitingOn: "internal",
  },
  "Strategy Call Complete": {
    nextAction: "Write up requirements and confirm the headcount",
    waitingOn: "internal",
  },
  "Requirements Captured": {
    nextAction: "Send the requirements to recruitment",
    waitingOn: "internal",
  },
  Recruitment: {
    nextAction: "Check recruitment progress against the target date",
    waitingOn: "recruitment",
  },
  "Profiles Ready": {
    nextAction: "Send the profiles to the client",
    waitingOn: "internal",
  },
  "Profiles Sent": {
    nextAction: "Follow up on the profiles waiting with the client",
    waitingOn: "client",
  },
  "Client Review": {
    nextAction: "Ask the client which profiles they want to interview",
    waitingOn: "client",
  },
  "Interview Scheduled": {
    nextAction: "Prepare the client and candidate for the interview",
    waitingOn: "client",
  },
  "Interview Complete": {
    nextAction: "Collect client feedback and the next step",
    waitingOn: "client",
  },
  "Candidate Selected": {
    nextAction: "Start the SOW with the selected candidate and rate",
    waitingOn: "internal",
  },
  "SOW Preparation": {
    nextAction: "Finish the SOW and send it to the client",
    waitingOn: "internal",
  },
  "SOW Sent": {
    nextAction: "Confirm the client has reviewed the SOW",
    waitingOn: "client",
  },
  "SOW Negotiation": {
    nextAction: "Resolve the open SOW points with the client",
    waitingOn: "client",
  },
  "SOW Signed": {
    nextAction: "Schedule onboarding and the start date",
    waitingOn: "internal",
  },
  Onboarding: {
    nextAction: "Complete onboarding and confirm the start",
    waitingOn: "internal",
  },
  "Client Started": {
    nextAction: "Confirm the first week is running",
    waitingOn: "internal",
  },
  Won: {
    nextAction: "Hand off ongoing delivery",
    waitingOn: "none",
  },
  Lost: {
    nextAction: "Record why it was lost",
    waitingOn: "none",
  },
  "On Hold / Nurture": {
    nextAction: "Set the date to revisit this client",
    waitingOn: "client",
  },
};

export function todayInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export const PROFILE_SEND_STAGE: OpportunityStage = "Email / Profile Preparation";
export const BOOKED_CALL_STAGE: OpportunityStage = "Strategy Call Proposed";
export const SALES_CALL_COMPLETE_STAGE: OpportunityStage = "Strategy Call Scheduled";

export const SALES_CALL_COMPLETE_TASKS = [
  "Send the meeting notes",
  "Send the talent request to the recruitment team",
  "Create a GC in Google Chat / Space",
] as const;

export function salesCallCompleteTasks(callOn: string) {
  return SALES_CALL_COMPLETE_TASKS.map((title) => ({ title, dueOn: callOn }));
}

export const INTERVIEW_COMPLETE_STAGE: OpportunityStage = "Interview Complete";
export const SOW_PREP_STAGE: OpportunityStage = "SOW Preparation";

export const HIDDEN_BOARD_STAGES = [
  "Strategy Call Complete",
  "Requirements Captured",
  "Profiles Ready",
  "Client Review",
  "Candidate Selected",
  "SOW Sent",
  "SOW Negotiation",
] as const satisfies readonly OpportunityStage[];

const BOARD_STAGE_ALIAS: Partial<Record<OpportunityStage, OpportunityStage>> = {
  "Strategy Call Complete": SALES_CALL_COMPLETE_STAGE,
  "Requirements Captured": SALES_CALL_COMPLETE_STAGE,
  "Profiles Ready": "Recruitment",
  "Client Review": "Profiles Sent",
  "Candidate Selected": INTERVIEW_COMPLETE_STAGE,
  "SOW Sent": SOW_PREP_STAGE,
  "SOW Negotiation": SOW_PREP_STAGE,
};

export function isHiddenBoardStage(stage: string) {
  return (HIDDEN_BOARD_STAGES as readonly string[]).includes(stage);
}

export function boardStage(stage: OpportunityStage): OpportunityStage {
  return BOARD_STAGE_ALIAS[stage] ?? stage;
}

export const BOARD_STAGES = OPPORTUNITY_STAGES.filter((stage) => !isHiddenBoardStage(stage));

export function stageLabel(stage: string) {
  if (stage === PROFILE_SEND_STAGE) return "Sent Profiles to the client";
  if (stage === BOOKED_CALL_STAGE) return "Booked Sales Call";
  if (stage === SALES_CALL_COMPLETE_STAGE) return "Sales Call Complete";
  if (stage === INTERVIEW_COMPLETE_STAGE) return "Interview Complete / Candidate Selected";
  if (stage === SOW_PREP_STAGE) return "SOW Prep / Sent";
  if (stage === "Onboarding") return "Trial period";
  if (isHiddenBoardStage(stage)) return stageLabel(boardStage(stage as OpportunityStage));
  return stage;
}

export function formatClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour > 23) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

export function profileSendCheckBacks(callOn: string | null | undefined, sentOn: string) {
  const base = callOn && /^\d{4}-\d{2}-\d{2}$/.test(callOn) ? callOn : sentOn;
  return { oneDay: addDays(base, 1), twoDays: addDays(base, 2) };
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addBusinessDays(isoDate: string, days: number) {
  let cursor = isoDate.slice(0, 10);
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    const day = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return cursor;
}

export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function dateInTimeZone(value: string | null, timeZone: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayInTimeZone(timeZone, parsed);
}

export function potentialMrr(headcount: number | null | undefined, billingRate: number | null | undefined) {
  if (headcount == null || billingRate == null) return null;
  if (!Number.isFinite(headcount) || !Number.isFinite(billingRate)) return null;
  if (headcount <= 0 || billingRate < 0) return null;
  return headcount * billingRate;
}

export function potentialArr(mrr: number | null) {
  return mrr == null ? null : mrr * 12;
}

export function isPipelineOpportunity(status: OpportunityStatus) {
  return status === "active";
}

export function isClosedWon(status: OpportunityStatus) {
  return status === "won";
}

const STATUS_ALIASES: Record<string, SendPilotStatus> = {
  interested: "Interested",
  "not interested": "Not Interested",
  notinterested: "Not Interested",
  uninterested: "Not Interested",
  "meeting booked": "Meeting Booked",
  booked: "Meeting Booked",
  "meeting complete": "Meeting Complete",
  "meeting completed": "Meeting Complete",
  closed: "Closed",
  "wrong person": "Wrong Person",
  "no response": "No Response",
  "no reply": "No Response",
  unresponsive: "No Response",
};

export function normalizeSendPilotStatus(value: string | null | undefined): SendPilotStatus | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return STATUS_ALIASES[cleaned] ?? STATUS_ALIASES[cleaned.replace(/\s+/g, "")] ?? null;
}

export function normalizeEmail(value: string | null | undefined) {
  const cleaned = value?.trim().toLowerCase() ?? "";
  return cleaned || null;
}

export function normalizeLinkedIn(value: string | null | undefined) {
  const cleaned = value?.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "") ?? "";
  return cleaned || null;
}

export function normalizeName(value: string | null | undefined) {
  const cleaned = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return cleaned || null;
}

export type ImportRow = {
  rowNumber: number;
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  linkedinUrl: string;
  phone: string;
  sendpilotStatus: string;
  source: string;
  extra: Record<string, string>;
};

const COLUMN_ALIASES: Record<keyof Omit<ImportRow, "rowNumber" | "extra">, string[]> = {
  name: ["name", "full name", "contact", "contact name", "lead name"],
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last", "surname"],
  company: ["company", "company name", "organization", "organisation", "account", "account name"],
  email: ["email", "e-mail", "email address", "work email"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile url", "profile url"],
  phone: ["phone", "phone number", "mobile", "mobile phone"],
  sendpilotStatus: ["sendpilot status", "status", "lead status", "tag"],
  source: ["source", "campaign", "list", "sequence"],
};

function canonicalHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_./]+/g, " ").replace(/\s+/g, " ");
}

export function mapImportRecords(records: Record<string, unknown>[], headerRow = 2): ImportRow[] {
  return records.map((record, index) => {
    const mapped: Record<string, string> = {};
    const extra: Record<string, string> = {};
    for (const [header, value] of Object.entries(record)) {
      const key = canonicalHeader(header);
      const field = (Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>).find((candidate) =>
        COLUMN_ALIASES[candidate].includes(key),
      );
      const text = value == null ? "" : String(value).trim();
      if (field) mapped[field] = text;
      else if (text) extra[header.trim()] = text;
    }
    return {
      rowNumber: headerRow + index,
      name: mapped.name ?? "",
      firstName: mapped.firstName ?? "",
      lastName: mapped.lastName ?? "",
      company: mapped.company ?? "",
      email: mapped.email ?? "",
      linkedinUrl: mapped.linkedinUrl ?? "",
      phone: mapped.phone ?? "",
      sendpilotStatus: mapped.sendpilotStatus ?? "",
      source: mapped.source ?? "",
      extra,
    };
  });
}

export function importSourceFromFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx" as const;
  if (lower.endsWith(".xls")) return "xls" as const;
  return "csv" as const;
}

export type AttentionSection =
  | "needs"
  | "today"
  | "upcoming"
  | "waiting_client"
  | "waiting_recruitment"
  | "stale"
  | "at_risk";

export type AttentionItem = {
  id: string;
  kind: string;
  severity: "overdue" | "today" | "upcoming" | "risk";
  title: string;
  detail: string;
  href: string;
  dueOn: string | null;
  sections: AttentionSection[];
};

type AttentionOpportunity = {
  id: string;
  title: string;
  companyName: string;
  stage: OpportunityStage;
  status: OpportunityStatus;
  riskLevel: RiskLevel;
  waitingOn: WaitingOn;
  nextAction: string | null;
  nextActionDate: string | null;
  lastActivityOn: string | null;
};

export type AttentionInput = {
  today: string;
  staleAfterDays: number;
  profilesWaitingDays: number;
  approachingWindowDays: number;
  opportunities: AttentionOpportunity[];
  followUps: Array<{
    id: string;
    opportunityId: string | null;
    leadId: string | null;
    title: string;
    dueOn: string;
    status: "open" | "completed" | "cancelled";
    companyName: string;
  }>;
  profileBatches: Array<{
    id: string;
    opportunityId: string;
    companyName: string;
    sentOn: string;
    profileCount: number;
    clientResponse: string | null;
    followUpOn: string | null;
  }>;
  recruitment: Array<{
    id: string;
    opportunityId: string;
    companyName: string;
    status: string;
    targetOn: string;
  }>;
  interviews: Array<{
    id: string;
    opportunityId: string;
    candidateName: string;
    companyName: string;
    interviewOn: string | null;
    status: string;
  }>;
  contracts: Array<{
    opportunityId: string;
    companyName: string;
    status: string;
    expectedStartOn: string | null;
  }>;
  strategyCalls: Array<{
    opportunityId: string;
    companyName: string;
    callOn: string | null;
    status: string;
  }>;
  unmatchedInterested: Array<{ leadId: string; name: string; companyName: string }>;
};

const CLOSED_RECRUITMENT = new Set(["Candidate Selected", "No Suitable Candidate"]);
const OPEN_INTERVIEW = new Set(["Requested", "Scheduled", "Reschedule", "Additional Interview"]);

function withinWindow(today: string, date: string | null, windowDays: number) {
  if (!date) return false;
  const delta = daysBetween(today, date);
  return delta >= 0 && delta <= windowDays;
}

export type WeekTaskKind = "strategy_call" | "follow_up" | "sow" | "interview" | "recruitment" | "profiles" | "next_action" | "start";

export type WeekTask = {
  id: string;
  date: string;
  kind: WeekTaskKind;
  label: string;
  title: string;
  company: string;
  href: string;
};

const WEEK_TASK_LABEL: Record<WeekTaskKind, string> = {
  strategy_call: "Strategy call",
  follow_up: "Follow-up",
  sow: "SOW",
  interview: "Interview",
  recruitment: "Recruitment",
  profiles: "Profiles",
  next_action: "Next action",
  start: "Client start",
};

export function weekStartMonday(iso: string) {
  const date = iso.slice(0, 10);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return addDays(date, -diff);
}

function kindFromAction(stage: string, action: string): WeekTaskKind {
  const text = `${stage} ${action}`.toLowerCase();
  if (text.includes("sow")) return "sow";
  if (text.includes("strategy call") || text.includes("sales call")) return "strategy_call";
  if (text.includes("interview")) return "interview";
  if (text.includes("profile")) return "profiles";
  if (text.includes("recruit")) return "recruitment";
  if (text.includes("follow")) return "follow_up";
  return "next_action";
}

function opportunityIdFromHref(href: string) {
  const match = href.match(/\/opportunities\/([^/?]+)/);
  return match?.[1] ?? null;
}

export function buildWeekTasks(input: AttentionInput): WeekTask[] {
  const tasks: WeekTask[] = [];
  const opportunityById = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const open = new Set<OpportunityStatus>(["active", "nurture", "on_hold"]);

  const push = (task: WeekTask) => {
    tasks.push(task);
  };
  const occupied = (opportunityId: string, date: string) =>
    tasks.some((task) => task.date === date && opportunityIdFromHref(task.href) === opportunityId);

  for (const followUp of input.followUps) {
    if (followUp.status !== "open" || !followUp.dueOn) continue;
    push({
      id: `follow-up-${followUp.id}`,
      date: followUp.dueOn,
      kind: "follow_up",
      label: WEEK_TASK_LABEL.follow_up,
      title: followUp.title,
      company: followUp.companyName,
      href: followUp.opportunityId ? `/opportunities/${followUp.opportunityId}?tab=follow-ups` : `/leads/${followUp.leadId ?? ""}`,
    });
  }

  for (const call of input.strategyCalls) {
    if (!call.callOn || (call.status !== "Scheduled" && call.status !== "Proposed")) continue;
    if (occupied(call.opportunityId, call.callOn)) continue;
    const opportunity = opportunityById.get(call.opportunityId);
    const sameDayAction = opportunity?.nextActionDate === call.callOn ? opportunity.nextAction : null;
    push({
      id: `call-${call.opportunityId}-${call.callOn}`,
      date: call.callOn,
      kind: "strategy_call",
      label: WEEK_TASK_LABEL.strategy_call,
      title: sameDayAction ?? "Sales call scheduled",
      company: call.companyName,
      href: `/opportunities/${call.opportunityId}?tab=strategy`,
    });
  }

  for (const interview of input.interviews) {
    if (!interview.interviewOn || !OPEN_INTERVIEW.has(interview.status)) continue;
    if (occupied(interview.opportunityId, interview.interviewOn)) continue;
    push({
      id: `interview-${interview.id}`,
      date: interview.interviewOn,
      kind: "interview",
      label: WEEK_TASK_LABEL.interview,
      title: interview.candidateName,
      company: interview.companyName,
      href: `/opportunities/${interview.opportunityId}?tab=interviews`,
    });
  }

  for (const request of input.recruitment) {
    if (CLOSED_RECRUITMENT.has(request.status) || !request.targetOn) continue;
    if (occupied(request.opportunityId, request.targetOn)) continue;
    push({
      id: `recruitment-${request.id}`,
      date: request.targetOn,
      kind: "recruitment",
      label: WEEK_TASK_LABEL.recruitment,
      title: request.status,
      company: request.companyName,
      href: `/recruitment/${request.id}`,
    });
  }

  for (const batch of input.profileBatches) {
    if (batch.clientResponse || !batch.followUpOn) continue;
    if (occupied(batch.opportunityId, batch.followUpOn)) continue;
    push({
      id: `profiles-${batch.id}`,
      date: batch.followUpOn,
      kind: "profiles",
      label: WEEK_TASK_LABEL.profiles,
      title: `${batch.profileCount} profiles awaiting a response`,
      company: batch.companyName,
      href: `/opportunities/${batch.opportunityId}?tab=recruitment`,
    });
  }

  for (const opportunity of input.opportunities) {
    if (!open.has(opportunity.status) || !opportunity.nextAction || !opportunity.nextActionDate) continue;
    if (occupied(opportunity.id, opportunity.nextActionDate)) continue;
    const kind = kindFromAction(opportunity.stage, opportunity.nextAction);
    push({
      id: `next-${opportunity.id}-${opportunity.nextActionDate}`,
      date: opportunity.nextActionDate,
      kind,
      label: WEEK_TASK_LABEL[kind],
      title: opportunity.nextAction,
      company: opportunity.companyName,
      href: `/opportunities/${opportunity.id}`,
    });
  }

  for (const contract of input.contracts) {
    const waitingOnSignature = contract.status === "Sent" || contract.status === "Negotiating";
    const hasSowTask = tasks.some((task) => task.kind === "sow" && opportunityIdFromHref(task.href) === contract.opportunityId);
    if (waitingOnSignature && !hasSowTask) {
      push({
        id: `sow-${contract.opportunityId}`,
        date: input.today,
        kind: "sow",
        label: WEEK_TASK_LABEL.sow,
        title: "Check back on the SOW",
        company: contract.companyName,
        href: `/opportunities/${contract.opportunityId}?tab=sow`,
      });
    }
    if (contract.expectedStartOn && waitingOnSignature && !occupied(contract.opportunityId, contract.expectedStartOn)) {
      push({
        id: `start-${contract.opportunityId}`,
        date: contract.expectedStartOn,
        kind: "start",
        label: WEEK_TASK_LABEL.start,
        title: "Expected start",
        company: contract.companyName,
        href: `/opportunities/${contract.opportunityId}?tab=sow`,
      });
    }
  }

  return tasks.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company) || a.label.localeCompare(b.label));
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const followUpDates = new Set(
    input.followUps.filter((item) => item.status === "open" && item.opportunityId).map((item) => `${item.opportunityId}:${item.dueOn}`),
  );
  const horizon = addDays(input.today, Math.max(input.approachingWindowDays, 7));

  for (const followUp of input.followUps) {
    if (followUp.status !== "open") continue;
    const href = followUp.opportunityId ? `/opportunities/${followUp.opportunityId}?tab=follow-ups` : `/leads/${followUp.leadId}`;
    const delta = daysBetween(input.today, followUp.dueOn);
    if (delta < 0) {
      items.push({
        id: `follow-up-${followUp.id}`,
        kind: "follow_up_overdue",
        severity: "overdue",
        title: followUp.title,
        detail: `${followUp.companyName} · ${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"} overdue`,
        href,
        dueOn: followUp.dueOn,
        sections: ["needs", "at_risk"],
      });
    } else if (delta === 0) {
      items.push({
        id: `follow-up-${followUp.id}`,
        kind: "follow_up_today",
        severity: "today",
        title: followUp.title,
        detail: followUp.companyName,
        href,
        dueOn: followUp.dueOn,
        sections: ["today"],
      });
    } else if (followUp.dueOn <= horizon) {
      items.push({
        id: `follow-up-${followUp.id}`,
        kind: "follow_up_upcoming",
        severity: "upcoming",
        title: followUp.title,
        detail: `${followUp.companyName} · due ${followUp.dueOn}`,
        href,
        dueOn: followUp.dueOn,
        sections: ["upcoming"],
      });
    }
  }

  for (const opportunity of input.opportunities) {
    const href = `/opportunities/${opportunity.id}`;
    const open = opportunity.status === "active" || opportunity.status === "nurture" || opportunity.status === "on_hold";
    if (!open) continue;

    if (opportunity.nextActionDate && !followUpDates.has(`${opportunity.id}:${opportunity.nextActionDate}`)) {
      const delta = daysBetween(input.today, opportunity.nextActionDate);
      if (delta < 0) {
        items.push({
          id: `next-${opportunity.id}`,
          kind: "next_action_overdue",
          severity: "overdue",
          title: opportunity.nextAction || "Next action overdue",
          detail: `${opportunity.companyName} · ${opportunity.stage}`,
          href,
          dueOn: opportunity.nextActionDate,
          sections: ["needs", "at_risk"],
        });
      } else if (delta === 0) {
        items.push({
          id: `next-${opportunity.id}`,
          kind: "next_action_today",
          severity: "today",
          title: opportunity.nextAction || "Next action due today",
          detail: `${opportunity.companyName} · ${opportunity.stage}`,
          href,
          dueOn: opportunity.nextActionDate,
          sections: ["today"],
        });
      } else if (opportunity.nextActionDate <= horizon) {
        items.push({
          id: `next-${opportunity.id}`,
          kind: "next_action_upcoming",
          severity: "upcoming",
          title: opportunity.nextAction || "Upcoming next action",
          detail: `${opportunity.companyName} · ${opportunity.stage}`,
          href,
          dueOn: opportunity.nextActionDate,
          sections: ["upcoming"],
        });
      }
    }

    const stale =
      !TERMINAL_STAGES.has(opportunity.stage) &&
      (opportunity.lastActivityOn == null || daysBetween(opportunity.lastActivityOn, input.today) >= input.staleAfterDays);
    if (stale) {
      const quietFor = opportunity.lastActivityOn == null ? null : daysBetween(opportunity.lastActivityOn, input.today);
      items.push({
        id: `stale-${opportunity.id}`,
        kind: "stale",
        severity: "risk",
        title: opportunity.companyName,
        detail: quietFor == null ? `${opportunity.stage} · no activity recorded` : `${opportunity.stage} · no activity for ${quietFor} days`,
        href,
        dueOn: opportunity.nextActionDate,
        sections: ["stale", "at_risk", "needs"],
      });
    }

    if (opportunity.waitingOn === "client") {
      items.push({
        id: `wait-client-${opportunity.id}`,
        kind: "waiting_client",
        severity: "upcoming",
        title: opportunity.companyName,
        detail: `${opportunity.stage} · waiting on the client`,
        href,
        dueOn: opportunity.nextActionDate,
        sections: ["waiting_client"],
      });
    }
    if (opportunity.waitingOn === "recruitment" || opportunity.stage === "Recruitment") {
      items.push({
        id: `wait-recruitment-${opportunity.id}`,
        kind: "waiting_recruitment",
        severity: "upcoming",
        title: opportunity.companyName,
        detail: "Waiting on recruitment",
        href: `/opportunities/${opportunity.id}?tab=recruitment`,
        dueOn: opportunity.nextActionDate,
        sections: ["waiting_recruitment"],
      });
    }
    if ((opportunity.riskLevel === "high" || opportunity.riskLevel === "critical") && !stale) {
      items.push({
        id: `risk-${opportunity.id}`,
        kind: "at_risk",
        severity: "risk",
        title: opportunity.companyName,
        detail: `${opportunity.riskLevel} risk · ${opportunity.stage}`,
        href,
        dueOn: opportunity.nextActionDate,
        sections: ["at_risk", "needs"],
      });
    }
  }

  for (const batch of input.profileBatches) {
    if (batch.clientResponse && batch.clientResponse.trim()) continue;
    const waiting = daysBetween(batch.sentOn, input.today);
    if (waiting >= input.profilesWaitingDays) {
      items.push({
        id: `profiles-${batch.id}`,
        kind: "profiles_waiting",
        severity: "overdue",
        title: `${batch.companyName} · ${batch.profileCount} profile${batch.profileCount === 1 ? "" : "s"} sent`,
        detail: `No response · ${waiting} days waiting${batch.followUpOn ? ` · follow-up ${batch.followUpOn}` : ""}`,
        href: `/opportunities/${batch.opportunityId}?tab=recruitment`,
        dueOn: batch.followUpOn,
        sections: ["needs", "waiting_client", "at_risk"],
      });
    }
  }

  for (const request of input.recruitment) {
    if (CLOSED_RECRUITMENT.has(request.status)) continue;
    const delta = daysBetween(input.today, request.targetOn);
    if (delta < 0) {
      items.push({
        id: `recruitment-${request.id}`,
        kind: "recruitment_overdue",
        severity: "overdue",
        title: `${request.companyName} recruitment is overdue`,
        detail: `${request.status} · target was ${request.targetOn}`,
        href: `/recruitment/${request.id}`,
        dueOn: request.targetOn,
        sections: ["needs", "waiting_recruitment", "at_risk"],
      });
    } else if (withinWindow(input.today, request.targetOn, input.approachingWindowDays)) {
      items.push({
        id: `recruitment-${request.id}`,
        kind: "recruitment_deadline",
        severity: delta === 0 ? "today" : "upcoming",
        title: `${request.companyName} recruitment target`,
        detail: `${request.status} · target ${request.targetOn}`,
        href: `/recruitment/${request.id}`,
        dueOn: request.targetOn,
        sections: delta === 0 ? ["today", "waiting_recruitment"] : ["upcoming", "waiting_recruitment"],
      });
    }
  }

  for (const interview of input.interviews) {
    if (!OPEN_INTERVIEW.has(interview.status) || !interview.interviewOn) continue;
    if (!withinWindow(input.today, interview.interviewOn, input.approachingWindowDays)) continue;
    const delta = daysBetween(input.today, interview.interviewOn);
    items.push({
      id: `interview-${interview.id}`,
      kind: "interview_approaching",
      severity: delta === 0 ? "today" : "upcoming",
      title: `${interview.candidateName} × ${interview.companyName}`,
      detail: `${interview.status} · ${interview.interviewOn}`,
      href: `/opportunities/${interview.opportunityId}?tab=interviews`,
      dueOn: interview.interviewOn,
      sections: delta === 0 ? ["today"] : ["upcoming"],
    });
  }

  for (const call of input.strategyCalls) {
    if (call.status !== "Scheduled" || !call.callOn) continue;
    if (!withinWindow(input.today, call.callOn, input.approachingWindowDays)) continue;
    const delta = daysBetween(input.today, call.callOn);
    items.push({
      id: `call-${call.opportunityId}`,
      kind: "strategy_call_approaching",
      severity: delta === 0 ? "today" : "upcoming",
      title: `Strategy call · ${call.companyName}`,
      detail: call.callOn,
      href: `/opportunities/${call.opportunityId}?tab=strategy`,
      dueOn: call.callOn,
      sections: delta === 0 ? ["today"] : ["upcoming"],
    });
  }

  for (const contract of input.contracts) {
    if (contract.status === "Sent" || contract.status === "Negotiating") {
      items.push({
        id: `sow-${contract.opportunityId}`,
        kind: "sow_awaiting",
        severity: "risk",
        title: `${contract.companyName} SOW is awaiting signature`,
        detail: contract.status,
        href: `/opportunities/${contract.opportunityId}?tab=sow`,
        dueOn: contract.expectedStartOn,
        sections: ["needs", "waiting_client"],
      });
    }
    if (
      contract.expectedStartOn &&
      contract.status !== "Cancelled" &&
      withinWindow(input.today, contract.expectedStartOn, input.approachingWindowDays)
    ) {
      items.push({
        id: `start-${contract.opportunityId}`,
        kind: "start_approaching",
        severity: "upcoming",
        title: `${contract.companyName} start date`,
        detail: contract.expectedStartOn,
        href: `/opportunities/${contract.opportunityId}?tab=sow`,
        dueOn: contract.expectedStartOn,
        sections: ["upcoming"],
      });
    }
  }

  for (const lead of input.unmatchedInterested) {
    items.push({
      id: `lead-${lead.leadId}`,
      kind: "unmatched_interested",
      severity: "risk",
      title: `${lead.name} — ${lead.companyName}`,
      detail: "SendPilot says Interested. No sales opportunity yet.",
      href: `/leads/${lead.leadId}`,
      dueOn: null,
      sections: ["needs", "at_risk"],
    });
  }

  const rank = { overdue: 0, today: 1, risk: 2, upcoming: 3 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
}

export type StageEvent = { opportunityId: string; stage: string; at: string };

export function firstStageEntries(events: StageEvent[]) {
  const byOpportunity = new Map<string, Map<string, string>>();
  for (const event of events) {
    const stages = byOpportunity.get(event.opportunityId) ?? new Map<string, string>();
    const current = stages.get(event.stage);
    if (!current || event.at < current) stages.set(event.stage, event.at);
    byOpportunity.set(event.opportunityId, stages);
  }
  return byOpportunity;
}

export type ConversionDefinition = { label: string; from: string[]; to: string[] };

export const CONVERSIONS: ConversionDefinition[] = [
  { label: "Interested → Strategy Call", from: ["Interested"], to: ["Strategy Call Scheduled", "Strategy Call Complete"] },
  { label: "Strategy Call → Recruitment", from: ["Strategy Call Complete"], to: ["Recruitment"] },
  { label: "Recruitment → Profiles Sent", from: ["Recruitment"], to: ["Profiles Sent"] },
  { label: "Profiles Sent → Interview", from: ["Profiles Sent"], to: ["Interview Scheduled", "Interview Complete"] },
  { label: "Interview → Candidate Selected", from: ["Interview Scheduled", "Interview Complete"], to: ["Candidate Selected"] },
  { label: "Candidate Selected → SOW Signed", from: ["Candidate Selected"], to: ["SOW Signed"] },
  { label: "SOW Signed → Client Started", from: ["SOW Signed"], to: ["Client Started", "Won"] },
];

function reached(stages: Map<string, string> | undefined, names: string[]) {
  if (!stages) return false;
  return names.some((name) => stages.has(name));
}

export function conversionRates(events: StageEvent[]) {
  const entries = firstStageEntries(events);
  return CONVERSIONS.map((definition) => {
    let denominator = 0;
    let numerator = 0;
    for (const stages of entries.values()) {
      if (!reached(stages, definition.from)) continue;
      denominator += 1;
      if (reached(stages, definition.to)) numerator += 1;
    }
    return {
      label: definition.label,
      fromCount: denominator,
      toCount: numerator,
      rate: denominator === 0 ? null : numerator / denominator,
    };
  });
}

export const TIME_METRICS: ConversionDefinition[] = [
  { label: "Interested → Strategy Call", from: ["Interested"], to: ["Strategy Call Scheduled", "Strategy Call Complete"] },
  { label: "Strategy Call → Recruitment", from: ["Strategy Call Complete"], to: ["Recruitment"] },
  { label: "Recruitment → Profiles Ready", from: ["Recruitment"], to: ["Profiles Ready", "Profiles Sent"] },
  { label: "Profiles Sent → Interview", from: ["Profiles Sent"], to: ["Interview Scheduled", "Interview Complete"] },
  { label: "Interview → Candidate Selected", from: ["Interview Scheduled", "Interview Complete"], to: ["Candidate Selected"] },
  { label: "Candidate Selected → SOW Signed", from: ["Candidate Selected"], to: ["SOW Signed"] },
  { label: "SOW Signed → Start", from: ["SOW Signed"], to: ["Client Started", "Won"] },
  { label: "Interested → Client Started", from: ["Interested"], to: ["Client Started", "Won"] },
];

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function earliest(stages: Map<string, string>, names: string[]) {
  const times = names.map((name) => stages.get(name)).filter((value): value is string => Boolean(value));
  if (times.length === 0) return null;
  return times.sort()[0];
}

export function timeMetrics(events: StageEvent[]) {
  const entries = firstStageEntries(events);
  return TIME_METRICS.map((definition) => {
    const samples: number[] = [];
    for (const stages of entries.values()) {
      const from = earliest(stages, definition.from);
      const to = earliest(stages, definition.to);
      if (!from || !to) continue;
      const days = daysBetween(from, to);
      if (days >= 0) samples.push(days);
    }
    const average = samples.length === 0 ? null : samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
      label: definition.label,
      samples: samples.length,
      averageDays: average,
      medianDays: median(samples),
    };
  });
}

