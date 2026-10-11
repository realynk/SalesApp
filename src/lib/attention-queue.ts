import type { AttentionItem } from "@/lib/domain";
import { personDisplayName } from "@/lib/lead-display";

export const ATTENTION_VIEWS = ["overdue", "today", "upcoming", "completed"] as const;
export type AttentionView = (typeof ATTENTION_VIEWS)[number];

export const WORKFLOW_REQUIRED_AUTOMATION = new Set([
  "call_day",
  "call_talent_request",
  "interview_day",
  "sow_confirm_start",
]);

export type AttentionQueueItem = {
  id: string;
  source: "follow_up" | "signal";
  followUpId: string | null;
  opportunityId: string | null;
  leadId: string | null;
  title: string;
  companyName: string;
  dueOn: string | null;
  completedAt: string | null;
  view: AttentionView;
  priority: "overdue" | "today" | "upcoming" | "done";
  automationType: string | null;
  href: string;
  action: "complete" | "open";
  actionLabel: string;
};

export type QueueFollowUp = {
  id: string;
  opportunityId: string | null;
  leadId: string | null;
  title: string;
  dueOn: string;
  status: "open" | "completed" | "cancelled";
  companyName: string;
  contactName?: string | null;
  urgent?: boolean;
  pendingSchedule?: boolean;
  automationType?: string | null;
  completedAt?: string | null;
};

export function canMarkFollowUpDone(automationType?: string | null) {
  return !WORKFLOW_REQUIRED_AUTOMATION.has(String(automationType ?? ""));
}

export function attentionViewForDue(today: string, dueOn: string | null, pendingSchedule = false): Exclude<AttentionView, "completed"> {
  if (!dueOn) return pendingSchedule ? "upcoming" : "today";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  return "upcoming";
}

export function isAttentionView(value: string | null | undefined): value is AttentionView {
  return ATTENTION_VIEWS.includes(value as AttentionView);
}

function hrefForFollowUp(item: QueueFollowUp) {
  if (item.opportunityId) return `/opportunities/${item.opportunityId}`;
  return `/leads/${item.leadId ?? ""}`;
}

function followUpQueueItem(item: QueueFollowUp, today: string): AttentionQueueItem {
  const completed = item.status === "completed";
  const view = completed ? "completed" : attentionViewForDue(today, item.dueOn, item.pendingSchedule);
  const completable = !completed && canMarkFollowUpDone(item.automationType);
  return {
    id: `follow-up-${item.id}`,
    source: "follow_up",
    followUpId: item.id,
    opportunityId: item.opportunityId,
    leadId: item.leadId,
    title: item.title,
    companyName: personDisplayName({ fullName: item.contactName, companyName: item.companyName }),
    dueOn: item.dueOn,
    completedAt: item.completedAt ?? null,
    view,
    priority: completed ? "done" : view === "overdue" ? "overdue" : view === "today" ? "today" : "upcoming",
    automationType: item.automationType ?? null,
    href: hrefForFollowUp(item),
    action: completable ? "complete" : "open",
    actionLabel: completable ? "Mark Done" : "Open profile",
  };
}

function coveredByFollowUp(
  signal: AttentionItem,
  followUps: QueueFollowUp[],
) {
  const opportunityId =
    signal.opportunityId ||
    (signal.href.startsWith("/opportunities/") ? signal.href.slice("/opportunities/".length).split("?")[0] : null);
  const open = followUps.filter((item) => item.status === "open");
  if (signal.kind.startsWith("next_action") && opportunityId) {
    return open.some((item) => item.opportunityId === opportunityId);
  }
  if (signal.kind === "strategy_call_approaching" && opportunityId) {
    return open.some(
      (item) =>
        item.opportunityId === opportunityId &&
        (item.automationType === "call_day" || /sales call|strategy call/i.test(item.title)),
    );
  }
  if (signal.kind === "interview_approaching" && opportunityId) {
    return open.some(
      (item) => item.opportunityId === opportunityId && (item.automationType === "interview_day" || /interview/i.test(item.title)),
    );
  }
  if (signal.kind === "profiles_waiting" && opportunityId) {
    return open.some((item) =>
      item.opportunityId === opportunityId &&
      ["candidate_profile_follow_1", "candidate_profile_follow_2", "awaiting_client_review"].includes(String(item.automationType ?? "")),
    );
  }
  if ((signal.kind === "recruitment_overdue" || signal.kind === "recruitment_deadline") && opportunityId) {
    return open.some((item) => item.opportunityId === opportunityId && item.automationType === "recruitment_progress");
  }
  if (signal.kind === "sow_awaiting" && opportunityId) {
    return open.some((item) => item.opportunityId === opportunityId && (item.automationType === "sow_signature" || item.automationType === "sow_confirm_start"));
  }
  if (signal.kind === "waiting_client" && opportunityId) {
    return open.some((item) => item.opportunityId === opportunityId && item.automationType === "awaiting_client_review");
  }
  if (signal.kind === "waiting_recruitment" && opportunityId) {
    return open.some((item) => item.opportunityId === opportunityId && item.automationType === "recruitment_progress");
  }
  return false;
}

function signalQueueItem(item: AttentionItem): AttentionQueueItem {
  const view = item.severity === "overdue" ? "overdue" : item.severity === "today" ? "today" : "upcoming";
  const opportunityId = item.href.startsWith("/opportunities/") ? item.href.slice("/opportunities/".length).split("?")[0] ?? null : null;
  const leadId = item.href.startsWith("/leads/") ? item.href.slice("/leads/".length).split("?")[0] ?? null : null;
  return {
    id: item.id,
    source: "signal",
    followUpId: null,
    opportunityId,
    leadId,
    title: item.title,
    companyName: item.detail,
    dueOn: item.dueOn,
    completedAt: null,
    view,
    priority: view === "overdue" ? "overdue" : view === "today" ? "today" : "upcoming",
    automationType: null,
    href: item.href,
    action: "open",
    actionLabel: "Open profile",
  };
}

export function buildAttentionQueue(input: {
  today: string;
  attention: AttentionItem[];
  followUps: QueueFollowUp[];
  completedFollowUps?: QueueFollowUp[];
}): AttentionQueueItem[] {
  const openFollowUps = input.followUps.filter((item) => item.status === "open");
  const completed = (input.completedFollowUps ?? input.followUps.filter((item) => item.status === "completed"))
    .filter((item) => item.status === "completed");
  const rows: AttentionQueueItem[] = openFollowUps.map((item) => followUpQueueItem(item, input.today));
  const followUpIds = new Set(rows.map((item) => item.followUpId).filter(Boolean));

  for (const signal of input.attention) {
    if (signal.id.startsWith("follow-up-")) {
      const id = signal.id.slice("follow-up-".length);
      if (followUpIds.has(id)) continue;
    }
    if (coveredByFollowUp(signal, openFollowUps)) continue;
    rows.push(signalQueueItem(signal));
  }

  for (const item of completed) {
    rows.push(followUpQueueItem(item, input.today));
  }

  const rank = { overdue: 0, today: 1, upcoming: 2, completed: 3 };
  return rows.sort((a, b) => rank[a.view] - rank[b.view] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title));
}

export function attentionQueueCounts(items: AttentionQueueItem[]) {
  const overdue = items.filter((item) => item.view === "overdue").length;
  const today = items.filter((item) => item.view === "today").length;
  const upcoming = items.filter((item) => item.view === "upcoming").length;
  const completed = items.filter((item) => item.view === "completed").length;
  return {
    overdue,
    today,
    upcoming,
    completed,
    open: overdue + today + upcoming,
  };
}

export function filterAttentionQueue(items: AttentionQueueItem[], view: AttentionView | "open" | null | undefined) {
  if (!view || view === "open") return items.filter((item) => item.view !== "completed");
  return items.filter((item) => item.view === view);
}

export function commandCenterPriorities(counts: ReturnType<typeof attentionQueueCounts>) {
  return [
    { key: "overdue", label: "Overdue", count: counts.overdue, href: "/notifications?view=overdue" },
    { key: "today", label: "Due today", count: counts.today, href: "/notifications?view=today" },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming, href: "/notifications?view=upcoming" },
  ];
}

export function attentionBadgeFromQueue(counts: { overdue: number; today: number }) {
  return counts.overdue + counts.today;
}
