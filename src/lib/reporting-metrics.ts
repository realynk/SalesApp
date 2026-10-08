import { dateInTimeZone, normalizeSendPilotStatus, notInterestedColumn, notInterestedOutcome, type SendPilotStatus } from "@/lib/domain";
import {
  calendarDateInWindow,
  eachCalendarDay,
  type ReportingWindow,
} from "@/lib/reporting-duration";

export const SALES_PROFILE_SENT_TITLE = "Profile sent to the client";
export const MEETING_BOOKED_STATUSES = ["Scheduled", "Complete"] as const;
export const MEETING_COMPLETED_STATUS = "Complete";

export type Coverage = "tracked" | "zero" | "unavailable";

export type ReportingActivity = {
  leadId: string | null;
  type: string;
  title: string;
  body: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type ReportingLead = {
  id: string;
  sendpilotStatus: SendPilotStatus | null;
  notInterestedOutcome: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type ReportingOpportunity = {
  id: string;
  leadId: string;
  stage: string;
  status: string;
  nextAction: string | null;
  nextActionDate: string | null;
};

export type ReportingIdentity = {
  leadId: string;
  integrationId: string;
};

export type ReportingIntegration = {
  id: string;
  name: string;
  legacyEnv: boolean;
};

export type ReportingStrategyCall = {
  id: string;
  opportunityId: string;
  leadId: string | null;
  callOn: string | null;
  status: string;
};

export type ReportingFollowUp = {
  id: string;
  leadId: string | null;
  title: string;
  dueOn: string;
  status: string;
};

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function isSalesProfileSent(activity: Pick<ReportingActivity, "type" | "title">) {
  return activity.type === "profile_sent" && activity.title === SALES_PROFILE_SENT_TITLE;
}

export function parseTagTransition(activity: ReportingActivity): { from: SendPilotStatus | null; to: SendPilotStatus } | null {
  const metaFrom = normalizeSendPilotStatus(asText(activity.metadata.previousStatus));
  const metaTo = normalizeSendPilotStatus(asText(activity.metadata.newStatus));

  if (activity.type === "lead_became_interested") {
    return { from: metaFrom, to: "Interested" };
  }
  if (activity.type !== "sendpilot_status_changed") return null;

  let to = metaTo;
  let from = metaFrom;
  const titleMatch = activity.title.match(/^Status set to (.+?)(?:\s·|$)/i);
  if (!to && titleMatch) to = normalizeSendPilotStatus(titleMatch[1] ?? null);
  const was = activity.body?.match(/^Was (.+)$/i);
  if (!from && was) from = normalizeSendPilotStatus(was[1] ?? null);
  if (activity.body?.includes("→")) {
    const [left, right] = activity.body.split("→").map((part) => part.trim());
    from = from ?? normalizeSendPilotStatus(left);
    to = to ?? normalizeSendPilotStatus(right);
  }
  if (!to) to = normalizeSendPilotStatus(activity.body);
  if (!to) return null;
  return { from, to };
}

export function isNewStatusTransition(from: SendPilotStatus | null, to: SendPilotStatus, target: SendPilotStatus) {
  return to === target && from !== target;
}

export function firstTransitionAt(
  activities: ReportingActivity[],
  target: SendPilotStatus,
  timeZone: string,
): Map<string, { at: string; day: string; integrationId: string | null }> {
  const sorted = [...activities].sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    if (byTime !== 0) return byTime;
    return (left.leadId ?? "").localeCompare(right.leadId ?? "");
  });
  const first = new Map<string, { at: string; day: string; integrationId: string | null }>();
  for (const activity of sorted) {
    if (!activity.leadId) continue;
    const parsed = parseTagTransition(activity);
    if (!parsed || !isNewStatusTransition(parsed.from, parsed.to, target)) continue;
    if (first.has(activity.leadId)) continue;
    const day = dateInTimeZone(activity.occurredAt, timeZone);
    if (!day) continue;
    first.set(activity.leadId, {
      at: activity.occurredAt,
      day,
      integrationId: asText(activity.metadata.integrationId),
    });
  }
  return first;
}

export function salesProfileEvents(activities: ReportingActivity[], timeZone: string) {
  return activities
    .filter((activity) => isSalesProfileSent(activity) && activity.leadId)
    .map((activity) => ({
      leadId: activity.leadId as string,
      at: activity.occurredAt,
      day: dateInTimeZone(activity.occurredAt, timeZone),
      integrationId: asText(activity.metadata.integrationId),
    }))
    .filter((item): item is typeof item & { day: string } => Boolean(item.day))
    .sort((left, right) => left.at.localeCompare(right.at));
}

export function firstSalesProfileAt(events: ReturnType<typeof salesProfileEvents>) {
  const first = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    if (!first.has(event.leadId)) first.set(event.leadId, event);
  }
  return first;
}

export function isMeetingBookedStatus(status: string) {
  return (MEETING_BOOKED_STATUSES as readonly string[]).includes(status);
}

export function isMeetingCompletedStatus(status: string) {
  return status === MEETING_COMPLETED_STATUS;
}

export type AccountKey = "main" | "other" | "both" | "unassigned";

export function accountKeyForLead(integrationIds: string[], mainId: string | null): AccountKey {
  const unique = [...new Set(integrationIds.filter(Boolean))];
  if (unique.length === 0) return "unassigned";
  const hasMain = Boolean(mainId && unique.includes(mainId));
  const hasOther = unique.some((id) => id !== mainId);
  if (hasMain && hasOther) return "both";
  if (hasMain) return "main";
  return "other";
}

export function attributeAccount(input: {
  activityIntegrationId: string | null;
  leadIntegrationIds: string[];
  mainId: string | null;
}): AccountKey {
  const activityId = input.activityIntegrationId;
  if (activityId) {
    if (input.mainId && activityId === input.mainId) return "main";
    return "other";
  }
  return accountKeyForLead(input.leadIntegrationIds, input.mainId);
}

export function rate(numerator: number, denominator: number): { numerator: number; denominator: number; rate: number | null; coverage: Coverage } {
  if (denominator === 0) return { numerator, denominator, rate: null, coverage: "unavailable" };
  return { numerator, denominator, rate: numerator / denominator, coverage: numerator === 0 ? "zero" : "tracked" };
}

export function formatCoverageValue(value: number, coverage: Coverage) {
  if (coverage === "unavailable") return "—";
  return String(value);
}

export async function fetchAllPages<T>(
  load: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const page = await load(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
    if (from > 200_000) break;
  }
  return all;
}

export type BuiltReporting = ReturnType<typeof buildReportingDashboard>;

export function buildReportingDashboard(input: {
  window: ReportingWindow;
  timeZone: string;
  leads: ReportingLead[];
  opportunities: ReportingOpportunity[];
  activities: ReportingActivity[];
  identities: ReportingIdentity[];
  integrations: ReportingIntegration[];
  strategyCalls: ReportingStrategyCall[];
  followUps: ReportingFollowUp[];
  stageEvents: { opportunityId: string; stage: string; at: string }[];
}) {
  const { window, timeZone } = input;
  const inWindow = (day: string | null | undefined) => calendarDateInWindow(day, window);

  const identitiesByLead = new Map<string, string[]>();
  for (const row of input.identities) {
    const list = identitiesByLead.get(row.leadId) ?? [];
    if (!list.includes(row.integrationId)) list.push(row.integrationId);
    identitiesByLead.set(row.leadId, list);
  }

  const main = input.integrations.find((item) => item.legacyEnv) ?? null;
  const others = input.integrations.filter((item) => !item.legacyEnv);
  const otherLabel = others.length === 1 ? others[0]!.name : others.length > 1 ? `${others.length} other accounts` : "Other SendPilot";
  const mainId = main?.id ?? null;

  const accountOf = (leadId: string, activityIntegrationId: string | null = null): AccountKey =>
    attributeAccount({
      activityIntegrationId,
      leadIntegrationIds: identitiesByLead.get(leadId) ?? [],
      mainId,
    });

  const firstInterested = firstTransitionAt(input.activities, "Interested", timeZone);
  const firstNotInterested = firstTransitionAt(input.activities, "Not Interested", timeZone);
  const profileEvents = salesProfileEvents(input.activities, timeZone);
  const firstProfile = firstSalesProfileAt(profileEvents);

  const newInterestedIds = [...firstInterested.entries()]
    .filter(([, value]) => inWindow(value.day))
    .map(([leadId]) => leadId);
  const newNotInterestedIds = [...firstNotInterested.entries()]
    .filter(([, value]) => inWindow(value.day))
    .map(([leadId]) => leadId);

  const profilesInPeriod = profileEvents.filter((item) => inWindow(item.day));
  const profileLeadIdsInPeriod = [...new Set(profilesInPeriod.map((item) => item.leadId))];

  const activeLeads = input.leads.filter((lead) => !lead.archivedAt);
  const awaitingProfile = activeLeads.filter(
    (lead) => lead.sendpilotStatus === "Interested" && !firstProfile.has(lead.id),
  );

  const interestedUntrackable = input.leads.filter(
    (lead) => lead.sendpilotStatus === "Interested" && !firstInterested.has(lead.id),
  );
  const notInterestedUntrackable = input.leads.filter(
    (lead) => lead.sendpilotStatus === "Not Interested" && !firstNotInterested.has(lead.id),
  );

  const calls = input.strategyCalls.map((call) => ({
    ...call,
    complete: isMeetingCompletedStatus(call.status),
    booked: isMeetingBookedStatus(call.status),
    missingDate: isMeetingBookedStatus(call.status) && !call.callOn,
  }));
  const meetingsBooked = calls.filter((call) => call.booked && inWindow(call.callOn));
  const meetingsCompleted = calls.filter((call) => call.complete && inWindow(call.callOn));
  const meetingsMissingDate = calls.filter((call) => call.missingDate);

  const callByLead = new Map<string, typeof calls>();
  for (const call of calls) {
    if (!call.leadId) continue;
    const list = callByLead.get(call.leadId) ?? [];
    list.push(call);
    callByLead.set(call.leadId, list);
  }

  function laterCompleted(leadId: string, afterDay: string) {
    return (callByLead.get(leadId) ?? []).some((call) => call.complete && call.callOn && call.callOn >= afterDay);
  }

  const interestedThenProfile = newInterestedIds.filter((leadId) => {
    const start = firstInterested.get(leadId);
    const profile = firstProfile.get(leadId);
    return Boolean(start && profile && profile.at >= start.at);
  });
  const interestedThenMeeting = newInterestedIds.filter((leadId) => {
    const start = firstInterested.get(leadId);
    if (!start) return false;
    return (callByLead.get(leadId) ?? []).some((call) => call.booked && call.callOn && call.callOn >= start.day);
  });
  const profileThenMeeting = interestedThenProfile.filter((leadId) => {
    const profile = firstProfile.get(leadId);
    if (!profile?.day) return false;
    return (callByLead.get(leadId) ?? []).some((call) => call.booked && call.callOn && call.callOn >= profile.day);
  });
  const bookedLeadIds = [...new Set(meetingsBooked.map((call) => call.leadId).filter((id): id is string => Boolean(id)))];
  const bookedThenComplete = bookedLeadIds.filter((leadId) => {
    const booked = (callByLead.get(leadId) ?? []).filter((call) => call.booked && call.callOn && inWindow(call.callOn));
    if (booked.length === 0) return false;
    const firstBookedDay = booked.map((call) => call.callOn as string).sort()[0]!;
    return laterCompleted(leadId, firstBookedDay);
  });

  const trendStart = window.startOn ?? (firstInterested.size || firstNotInterested.size || profilesInPeriod.length
    ? [
        ...[...firstInterested.values()].map((item) => item.day),
        ...[...firstNotInterested.values()].map((item) => item.day),
        ...profilesInPeriod.map((item) => item.day),
      ].sort()[0] ?? window.endOn
    : window.endOn);
  const trendFrom = window.key === "all" && (!window.startOn)
    ? (trendStart < addDaysSafe(window.endOn, -89) ? addDaysSafe(window.endOn, -89) : trendStart)
    : (window.startOn ?? trendStart);
  const trendDays = eachCalendarDay(trendFrom > window.endOn ? window.endOn : trendFrom, window.endOn);
  const trendAllTimeClipped = window.key === "all" && window.startOn == null && trendFrom !== trendStart;

  const newInterestedByDay = countByDay(newInterestedIds.map((id) => firstInterested.get(id)!.day));
  const newNotInterestedByDay = countByDay(newNotInterestedIds.map((id) => firstNotInterested.get(id)!.day));
  const profilesByDay = countByDay(profilesInPeriod.map((item) => item.day));
  const meetingsBookedByDay = countByDay(meetingsBooked.map((item) => item.callOn as string));
  const meetingsCompletedByDay = countByDay(meetingsCompleted.map((item) => item.callOn as string));

  const trends = trendDays.map((day) => ({
    day,
    newInterested: newInterestedByDay.get(day) ?? 0,
    newNotInterested: newNotInterestedByDay.get(day) ?? 0,
    profilesSent: profilesByDay.get(day) ?? 0,
    meetingsBooked: meetingsBookedByDay.get(day) ?? 0,
    meetingsCompleted: meetingsCompletedByDay.get(day) ?? 0,
  }));

  function bucketIds(ids: string[], integrationFromFirst?: Map<string, { integrationId: string | null }>) {
    const buckets: Record<AccountKey, string[]> = { main: [], other: [], both: [], unassigned: [] };
    for (const id of ids) {
      const activityIntegration = integrationFromFirst?.get(id)?.integrationId ?? null;
      buckets[accountOf(id, activityIntegration)].push(id);
    }
    return buckets;
  }

  const interestedBuckets = bucketIds(newInterestedIds, firstInterested);
  const notInterestedBuckets = bucketIds(newNotInterestedIds, firstNotInterested);
  const profileBuckets = bucketIds(profileLeadIdsInPeriod);

  const uniqueAssigned = new Set(
    [...identitiesByLead.entries()].filter(([, ids]) => ids.length > 0).map(([leadId]) => leadId),
  );
  const unassignedLeads = activeLeads.filter((lead) => !identitiesByLead.has(lead.id) || (identitiesByLead.get(lead.id) ?? []).length === 0);
  const bothLeadIds = [...identitiesByLead.entries()]
    .filter(([, ids]) => accountKeyForLead(ids, mainId) === "both")
    .map(([leadId]) => leadId);

  const snapshotActive = activeLeads;
  const laterLeadIds = new Set(
    input.opportunities.filter((item) => item.stage && item.stage !== "Interested").map((item) => item.leadId),
  );

  const followUpsActive = input.followUps.filter((item) => {
    if (item.status !== "open") return false;
    if (!item.leadId) return true;
    const lead = input.leads.find((row) => row.id === item.leadId);
    return !lead?.archivedAt;
  });
  const dueToday = followUpsActive.filter((item) => item.dueOn === window.endOn);
  const overdue = followUpsActive.filter((item) => item.dueOn < window.endOn);
  const aging = {
    d1to3: overdue.filter((item) => ageDays(item.dueOn, window.endOn) <= 3).length,
    d4to7: overdue.filter((item) => {
      const days = ageDays(item.dueOn, window.endOn);
      return days >= 4 && days <= 7;
    }).length,
    d8to14: overdue.filter((item) => {
      const days = ageDays(item.dueOn, window.endOn);
      return days >= 8 && days <= 14;
    }).length,
    d15plus: overdue.filter((item) => ageDays(item.dueOn, window.endOn) >= 15).length,
  };
  const openNextActions = input.opportunities.filter((item) => {
    if (!item.nextActionDate || !item.nextAction) return false;
    if (item.status === "won" || item.status === "lost") return false;
    const lead = input.leads.find((row) => row.id === item.leadId);
    return !lead?.archivedAt;
  });

  return {
    timeZone,
    window,
    accounts: {
      mainName: main?.name ?? "Realynk Main",
      otherName: otherLabel,
      mainId,
      otherIds: others.map((item) => item.id),
      otherNames: others.map((item) => item.name),
    },
    currentlyTagged: {
      totalLeads: snapshotActive.length,
      interested: snapshotActive.filter((lead) => lead.sendpilotStatus === "Interested").length,
      notInterested: snapshotActive.filter((lead) => lead.sendpilotStatus === "Not Interested").length,
      meetingBookedTag: snapshotActive.filter((lead) => lead.sendpilotStatus === "Meeting Booked").length,
      sendpilot: statusCounts(snapshotActive),
      journey: journeyCounts(snapshotActive, input.opportunities, laterLeadIds),
      outcomes: outcomeCounts(snapshotActive),
    },
    overview: {
      newInterested: newInterestedIds.length,
      newNotInterested: newNotInterestedIds.length,
      salesProfilesSentLeads: profileLeadIdsInPeriod.length,
      salesProfilesSentEvents: profilesInPeriod.length,
      awaitingProfile: awaitingProfile.length,
      meetingsBooked: meetingsBooked.length,
      meetingsCompleted: meetingsCompleted.length,
      meetingsMissingDate: meetingsMissingDate.length,
      meetingsWithoutLead: calls.filter((call) => call.booked && !call.leadId).length,
      interestedUntrackable: interestedUntrackable.length,
      notInterestedUntrackable: notInterestedUntrackable.length,
      conversions: {
        interestedToProfile: rate(interestedThenProfile.length, newInterestedIds.length),
        interestedToMeeting: rate(interestedThenMeeting.length, newInterestedIds.length),
        profileToMeeting: rate(profileThenMeeting.length, interestedThenProfile.length),
        meetingToComplete: rate(bookedThenComplete.length, bookedLeadIds.length),
      },
    },
    comparison: {
      newInterested: countBuckets(interestedBuckets),
      newNotInterested: countBuckets(notInterestedBuckets),
      profilesSent: countBuckets(profileBuckets),
      bothAccounts: bothLeadIds.length,
      unassignedActive: unassignedLeads.length,
      assignedActive: activeLeads.length - unassignedLeads.length,
      uniqueAssigned: uniqueAssigned.size,
      coverageRate: rate(activeLeads.length - unassignedLeads.length, activeLeads.length),
    },
    salesFunnel: {
      interested: newInterestedIds.length,
      profileSent: interestedThenProfile.length,
      meetingBooked: profileThenMeeting.length,
      meetingCompleted: profileThenMeeting.filter((leadId) => {
        const profile = firstProfile.get(leadId);
        if (!profile?.day) return false;
        return laterCompleted(leadId, profile.day);
      }).length,
    },
    followUp: {
      open: followUpsActive.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      aging,
      openNextActions: openNextActions.length,
    },
    trends,
    trendAllTimeClipped,
    unusedStageEvents: input.stageEvents.length,
  };
}

function addDaysSafe(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ageDays(dueOn: string, today: string) {
  const start = Date.parse(`${dueOn.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function countByDay(days: string[]) {
  const map = new Map<string, number>();
  for (const day of days) map.set(day, (map.get(day) ?? 0) + 1);
  return map;
}

function countBuckets(buckets: Record<AccountKey, string[]>) {
  const main = buckets.main.length;
  const other = buckets.other.length;
  const both = buckets.both.length;
  const unassigned = buckets.unassigned.length;
  const combinedUnique = new Set([...buckets.main, ...buckets.other, ...buckets.both]).size;
  return { main, other, both, unassigned, combinedUnique };
}

function statusCounts(leads: ReportingLead[]) {
  const statuses: SendPilotStatus[] = [
    "Interested",
    "Not Interested",
    "Meeting Booked",
    "Meeting Complete",
    "Closed",
    "Wrong Person",
    "No Response",
  ];
  return statuses.map((status) => ({
    label: status,
    count: leads.filter((lead) => lead.sendpilotStatus === status).length,
  }));
}

function journeyCounts(leads: ReportingLead[], opportunities: ReportingOpportunity[], laterLeadIds: Set<string>) {
  const byLead = new Map(opportunities.map((item) => [item.leadId, item.stage]));
  const labels = new Map<string, number>();
  for (const lead of leads) {
    if (lead.sendpilotStatus === "Interested" && !laterLeadIds.has(lead.id)) {
      labels.set("Interested", (labels.get("Interested") ?? 0) + 1);
      continue;
    }
    const stage = byLead.get(lead.id);
    if (!stage) continue;
    labels.set(stage, (labels.get(stage) ?? 0) + 1);
  }
  return [...labels.entries()].map(([label, count]) => ({ label, count }));
}

function outcomeCounts(leads: ReportingLead[]) {
  const notInterested = leads.filter((lead) => lead.sendpilotStatus === "Not Interested");
  const buckets = new Map<string, number>();
  for (const lead of notInterested) {
    const column = notInterestedColumn(notInterestedOutcome(lead.notInterestedOutcome));
    buckets.set(column, (buckets.get(column) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([label, count]) => ({ label, count }));
}
