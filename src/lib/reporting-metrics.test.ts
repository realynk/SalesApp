import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDuration, parseReportingTab, resolveReportingWindow } from "./reporting-duration.ts";
import {
  SALES_PROFILE_SENT_TITLE,
  accountKeyForLead,
  attributeAccount,
  buildReportingDashboard,
  firstTransitionAt,
  isSalesProfileSent,
  parseTagTransition,
  rate,
  type ReportingActivity,
  type ReportingLead,
} from "./reporting-metrics.ts";

const TZ = "Asia/Manila";

function activity(partial: Partial<ReportingActivity> & Pick<ReportingActivity, "type" | "occurredAt">): ReportingActivity {
  return {
    leadId: "lead-1",
    title: "",
    body: null,
    metadata: {},
    ...partial,
  };
}

test("today and custom windows use inclusive calendar bounds", () => {
  assert.equal(parseReportingDuration("today"), "today");
  assert.equal(parseReportingDuration("custom"), "custom");
  const today = resolveReportingWindow({ range: "today", today: "2026-10-08" });
  assert.equal(today.startOn, "2026-10-08");
  assert.equal(today.endOn, "2026-10-08");
  const custom = resolveReportingWindow({ range: "custom", from: "2026-10-10", to: "2026-10-01", today: "2026-10-08" });
  assert.equal(custom.startOn, "2026-10-01");
  assert.equal(custom.endOn, "2026-10-08");
  assert.equal(parseReportingTab("comparison"), "comparison");
  assert.equal(parseReportingTab("nope"), "overview");
});

test("tag transitions prefer metadata and do not treat current snapshots as events", () => {
  assert.deepEqual(
    parseTagTransition(activity({
      type: "lead_became_interested",
      occurredAt: "2026-10-08T16:00:00.000Z",
      metadata: { previousStatus: "No Response" },
    })),
    { from: "No Response", to: "Interested" },
  );
  assert.deepEqual(
    parseTagTransition(activity({
      type: "sendpilot_status_changed",
      occurredAt: "2026-10-08T16:00:00.000Z",
      title: "SendPilot status changed",
      body: "Interested → Not Interested",
      metadata: {},
    })),
    { from: "Interested", to: "Not Interested" },
  );
  assert.equal(parseTagTransition(activity({ type: "profile_sent", occurredAt: "2026-10-08T16:00:00.000Z", title: SALES_PROFILE_SENT_TITLE })), null);
});

test("first Interested is unique per lead and ignores later retags", () => {
  const first = firstTransitionAt([
    activity({ type: "lead_became_interested", leadId: "a", occurredAt: "2026-10-01T02:00:00.000Z" }),
    activity({
      type: "sendpilot_status_changed",
      leadId: "a",
      occurredAt: "2026-10-02T02:00:00.000Z",
      metadata: { previousStatus: "Interested", newStatus: "Not Interested" },
    }),
    activity({
      type: "lead_became_interested",
      leadId: "a",
      occurredAt: "2026-10-05T02:00:00.000Z",
      metadata: { previousStatus: "Not Interested" },
    }),
  ], "Interested", TZ);
  assert.equal(first.size, 1);
  assert.equal(first.get("a")?.day, "2026-10-01");
});

test("sales profile events exclude recruitment batches", () => {
  assert.equal(isSalesProfileSent({ type: "profile_sent", title: SALES_PROFILE_SENT_TITLE }), true);
  assert.equal(isSalesProfileSent({ type: "profile_sent", title: "3 profiles sent" }), false);
  assert.equal(isSalesProfileSent({ type: "candidate_profile_sent", title: SALES_PROFILE_SENT_TITLE }), false);
});

test("Manila timezone puts late UTC evenings on the next local day", () => {
  const first = firstTransitionAt([
    activity({ type: "lead_became_interested", leadId: "a", occurredAt: "2026-10-07T16:30:00.000Z" }),
  ], "Interested", TZ);
  assert.equal(first.get("a")?.day, "2026-10-08");
  const ny = firstTransitionAt([
    activity({ type: "lead_became_interested", leadId: "a", occurredAt: "2026-10-07T16:30:00.000Z" }),
  ], "Interested", "America/New_York");
  assert.equal(ny.get("a")?.day, "2026-10-07");
});

test("imported leads without a transition stay untrackable and are not dated from created_at", () => {
  const window = resolveReportingWindow({ range: "30d", today: "2026-10-08" });
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [
      { id: "imp", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-07T00:00:00.000Z" },
    ],
    opportunities: [],
    activities: [
      activity({ type: "lead_imported", leadId: "imp", occurredAt: "2026-10-07T00:00:00.000Z", title: "Lead imported from SendPilot file" }),
    ],
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(report.overview.newInterested, 0);
  assert.equal(report.overview.interestedUntrackable, 1);
  assert.equal(report.overview.awaitingProfile, 1);
  assert.equal(report.currentlyTagged.interested, 1);
});

test("Not Interested is counted independently of Interested", () => {
  const window = resolveReportingWindow({ range: "today", today: "2026-10-08" });
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [
      { id: "n", sendpilotStatus: "Not Interested", notInterestedOutcome: "Stop", archivedAt: null, createdAt: "2026-10-08T00:00:00.000Z" },
    ],
    opportunities: [],
    activities: [
      activity({
        type: "sendpilot_status_changed",
        leadId: "n",
        occurredAt: "2026-10-07T16:10:00.000Z",
        metadata: { previousStatus: "No Response", newStatus: "Not Interested" },
      }),
    ],
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(report.overview.newNotInterested, 1);
  assert.equal(report.overview.newInterested, 0);
});

test("archived leads appear in event KPIs but not current-state KPIs", () => {
  const window = resolveReportingWindow({ range: "7d", today: "2026-10-08" });
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [
      { id: "a", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: "2026-10-07T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
    ],
    opportunities: [],
    activities: [
      activity({ type: "lead_became_interested", leadId: "a", occurredAt: "2026-10-06T02:00:00.000Z" }),
      activity({ type: "lead_became_interested", leadId: "b", occurredAt: "2026-10-06T02:00:00.000Z" }),
      activity({ type: "profile_sent", leadId: "b", occurredAt: "2026-10-07T02:00:00.000Z", title: SALES_PROFILE_SENT_TITLE }),
    ],
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [{ id: "f1", leadId: "a", title: "Call", dueOn: "2026-10-07", status: "open" }],
    stageEvents: [],
  });
  assert.equal(report.overview.newInterested, 2);
  assert.equal(report.currentlyTagged.interested, 1);
  assert.equal(report.overview.awaitingProfile, 0);
  assert.equal(report.followUp.open, 0);
});

test("meetings use strategy_calls date and status only", () => {
  const window = resolveReportingWindow({ range: "today", today: "2026-10-08" });
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [{ id: "m", sendpilotStatus: "Meeting Booked", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" }],
    opportunities: [{ id: "o1", leadId: "m", stage: "Strategy Call Scheduled", status: "active", nextAction: null, nextActionDate: null }],
    activities: [
      activity({ type: "strategy_call_scheduled", leadId: "m", occurredAt: "2026-10-07T16:00:00.000Z", title: "Strategy call scheduled" }),
    ],
    identities: [],
    integrations: [],
    strategyCalls: [
      { id: "c1", opportunityId: "o1", leadId: "m", callOn: "2026-10-08", status: "Scheduled" },
      { id: "c2", opportunityId: "o2", leadId: "x", callOn: "2026-10-08", status: "Complete" },
      { id: "c3", opportunityId: "o3", leadId: "y", callOn: null, status: "Scheduled" },
      { id: "c4", opportunityId: "o4", leadId: "z", callOn: "2026-10-08", status: "Draft" },
      { id: "c5", opportunityId: "o5", leadId: "z2", callOn: "2026-10-08", status: "Cancelled" },
    ],
    followUps: [],
    stageEvents: [{ opportunityId: "o1", stage: "Strategy Call Proposed", at: "2026-10-08T00:00:00.000Z" }],
  });
  assert.equal(report.overview.meetingsBooked, 2);
  assert.equal(report.overview.meetingsCompleted, 1);
  assert.equal(report.overview.meetingsMissingDate, 1);
  assert.equal(report.currentlyTagged.meetingBookedTag, 1);
});

test("cross-account overlap is unique in combined totals", () => {
  assert.equal(accountKeyForLead(["main"], "main"), "main");
  assert.equal(accountKeyForLead(["trey"], "main"), "other");
  assert.equal(accountKeyForLead(["main", "trey"], "main"), "both");
  assert.equal(accountKeyForLead([], "main"), "unassigned");
  assert.equal(attributeAccount({ activityIntegrationId: "trey", leadIntegrationIds: ["main"], mainId: "main" }), "other");

  const window = resolveReportingWindow({ range: "7d", today: "2026-10-08" });
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [
      { id: "both", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "main-only", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "none", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
    ],
    opportunities: [],
    activities: [
      activity({ type: "lead_became_interested", leadId: "both", occurredAt: "2026-10-06T02:00:00.000Z" }),
      activity({ type: "lead_became_interested", leadId: "main-only", occurredAt: "2026-10-06T02:00:00.000Z", metadata: { integrationId: "main" } }),
    ],
    identities: [
      { leadId: "both", integrationId: "main" },
      { leadId: "both", integrationId: "trey" },
      { leadId: "main-only", integrationId: "main" },
    ],
    integrations: [
      { id: "main", name: "Realynk Main", legacyEnv: true },
      { id: "trey", name: "Trey's SendPilot", legacyEnv: false },
    ],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(report.accounts.otherName, "Trey's SendPilot");
  assert.equal(report.comparison.newInterested.main, 1);
  assert.equal(report.comparison.newInterested.both, 1);
  assert.equal(report.comparison.newInterested.combinedUnique, 2);
  assert.equal(report.comparison.bothAccounts, 1);
  assert.equal(report.comparison.unassignedActive, 1);
});

test("true zero conversion is distinct from unavailable tracking", () => {
  assert.deepEqual(rate(0, 0), { numerator: 0, denominator: 0, rate: null, coverage: "unavailable" });
  assert.deepEqual(rate(0, 4), { numerator: 0, denominator: 4, rate: 0, coverage: "zero" });
  const window = resolveReportingWindow({ range: "today", today: "2026-10-08" });
  const empty = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [],
    opportunities: [],
    activities: [],
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(empty.overview.conversions.interestedToProfile.coverage, "unavailable");
  const zero = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads: [{ id: "a", sendpilotStatus: "Interested", notInterestedOutcome: null, archivedAt: null, createdAt: "2026-10-08T00:00:00.000Z" }],
    opportunities: [],
    activities: [activity({ type: "lead_became_interested", leadId: "a", occurredAt: "2026-10-07T16:00:00.000Z" })],
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(zero.overview.conversions.interestedToProfile.coverage, "zero");
  assert.equal(zero.overview.conversions.interestedToProfile.rate, 0);
});

test("more than 500 leads are all counted in snapshot and events", () => {
  const window = resolveReportingWindow({ range: "all", today: "2026-10-08" });
  const leads: ReportingLead[] = Array.from({ length: 612 }, (_, index) => ({
    id: `lead-${index}`,
    sendpilotStatus: "Interested" as const,
    notInterestedOutcome: null,
    archivedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  }));
  const activities = leads.map((lead, index) =>
    activity({
      type: "lead_became_interested",
      leadId: lead.id,
      occurredAt: `2026-10-01T0${index % 8}:00:00.000Z`,
    }),
  );
  const report = buildReportingDashboard({
    window,
    timeZone: TZ,
    leads,
    opportunities: [],
    activities,
    identities: [],
    integrations: [],
    strategyCalls: [],
    followUps: [],
    stageEvents: [],
  });
  assert.equal(report.currentlyTagged.interested, 612);
  assert.equal(report.overview.newInterested, 612);
  assert.equal(report.overview.awaitingProfile, 612);
});

test("fetch page helper concatenates every page", async () => {
  const { fetchAllPages } = await import("./reporting-metrics.ts");
  const pages = [
    Array.from({ length: 1000 }, (_, i) => i),
    Array.from({ length: 1000 }, (_, i) => i + 1000),
    Array.from({ length: 12 }, (_, i) => i + 2000),
  ];
  const all = await fetchAllPages(async (from, to) => {
    const size = to - from + 1;
    const page = Math.floor(from / size);
    return pages[page] ?? [];
  }, 1000);
  assert.equal(all.length, 2012);
  assert.equal(all[0], 0);
  assert.equal(all[2011], 2011);
});
