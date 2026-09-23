import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  buildAttention,
  conversionRates,
  mapImportRecords,
  median,
  normalizeSendPilotStatus,
  potentialArr,
  potentialMrr,
  timeMetrics,
} from "./domain.ts";

test("normalizes SendPilot statuses without inventing new ones", () => {
  assert.equal(normalizeSendPilotStatus(" interested "), "Interested");
  assert.equal(normalizeSendPilotStatus("Not Interested"), "Not Interested");
  assert.equal(normalizeSendPilotStatus("meeting completed"), "Meeting Complete");
  assert.equal(normalizeSendPilotStatus("no reply"), "No Response");
  assert.equal(normalizeSendPilotStatus("warm"), null);
});

test("calculates potential revenue only from headcount and rate", () => {
  assert.equal(potentialMrr(3, 2000), 6000);
  assert.equal(potentialArr(potentialMrr(2, 1900)), 45600);
  assert.equal(potentialMrr(null, 1900), null);
  assert.equal(potentialMrr(0, 1900), null);
});

test("adds business days and skips weekends", () => {
  assert.equal(addBusinessDays("2026-09-18", 1), "2026-09-21");
  assert.equal(addBusinessDays("2026-09-23", 7), "2026-10-02");
});

test("maps flexible spreadsheet headers and keeps extra fields", () => {
  const rows = mapImportRecords([
    {
      "Full Name": "John Smith",
      Company: "ABC Company",
      "Email Address": "john@abc.example",
      "LinkedIn URL": "https://www.linkedin.com/in/johnsmith/",
      Status: "Interested",
      Campaign: "September outbound",
      Title: "COO",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.company, "ABC Company");
  assert.equal(rows[0]?.email, "john@abc.example");
  assert.equal(rows[0]?.linkedinUrl, "https://www.linkedin.com/in/johnsmith/");
  assert.equal(rows[0]?.sendpilotStatus, "Interested");
  assert.equal(rows[0]?.source, "September outbound");
  assert.equal(rows[0]?.extra.Title, "COO");
});

test("surfaces overdue follow-ups, stale opportunities, and interested leads with no opportunity", () => {
  const items = buildAttention({
    today: "2026-09-23",
    staleAfterDays: 10,
    profilesWaitingDays: 5,
    approachingWindowDays: 3,
    opportunities: [
      {
        id: "opp-stale",
        title: "Kinfolk",
        companyName: "Kinfolk Hospitality",
        stage: "Email / Profile Preparation",
        status: "active",
        riskLevel: "high",
        waitingOn: "internal",
        nextAction: "Restart the profile email",
        nextActionDate: "2026-09-23",
        lastActivityOn: "2026-09-05",
      },
    ],
    followUps: [
      {
        id: "fu-1",
        opportunityId: "opp-field",
        leadId: "lead-field",
        title: "Ask whether the budget opened",
        dueOn: "2026-09-21",
        status: "open",
        companyName: "Fieldnote Marketing",
      },
    ],
    profileBatches: [
      {
        id: "batch-1",
        opportunityId: "opp-lumen",
        companyName: "Lumen Dental Group",
        sentOn: "2026-09-17",
        profileCount: 3,
        clientResponse: null,
        followUpOn: "2026-09-24",
      },
    ],
    recruitment: [
      {
        id: "req-1",
        opportunityId: "opp-summit",
        companyName: "Summit Property Management",
        status: "Sourcing",
        targetOn: "2026-09-22",
      },
    ],
    interviews: [],
    contracts: [
      { opportunityId: "opp-bright", companyName: "BrightPath Mortgage", status: "Sent", expectedStartOn: "2026-10-14" },
    ],
    strategyCalls: [],
    unmatchedInterested: [{ leadId: "lead-leah", name: "Leah Okonkwo", companyName: "Westline Architects" }],
  });

  assert.ok(items.some((item) => item.kind === "follow_up_overdue" && item.sections.includes("needs")));
  assert.ok(items.some((item) => item.kind === "stale" && item.detail.includes("18 days")));
  assert.ok(items.some((item) => item.kind === "profiles_waiting" && item.detail.includes("6 days")));
  assert.ok(items.some((item) => item.kind === "recruitment_overdue"));
  assert.ok(items.some((item) => item.kind === "sow_awaiting"));
  assert.ok(items.some((item) => item.kind === "unmatched_interested"));
  assert.equal(items[0]?.severity, "overdue");
});

test("does not duplicate a next action that is already a follow-up", () => {
  const items = buildAttention({
    today: "2026-09-23",
    staleAfterDays: 10,
    profilesWaitingDays: 5,
    approachingWindowDays: 3,
    opportunities: [
      {
        id: "opp-1",
        title: "Northstar",
        companyName: "Northstar Legal Group",
        stage: "Email / Profile Preparation",
        status: "active",
        riskLevel: "low",
        waitingOn: "internal",
        nextAction: "Send the firm profile",
        nextActionDate: "2026-09-23",
        lastActivityOn: "2026-09-22",
      },
    ],
    followUps: [
      {
        id: "fu",
        opportunityId: "opp-1",
        leadId: null,
        title: "Send the firm profile",
        dueOn: "2026-09-23",
        status: "open",
        companyName: "Northstar Legal Group",
      },
    ],
    profileBatches: [],
    recruitment: [],
    interviews: [],
    contracts: [],
    strategyCalls: [],
    unmatchedInterested: [],
  });
  assert.equal(items.filter((item) => item.kind === "follow_up_today").length, 1);
  assert.equal(items.filter((item) => item.kind === "next_action_today").length, 0);
});

test("calculates conversion and duration from stage history", () => {
  const events = [
    { opportunityId: "a", stage: "Interested", at: "2026-08-01" },
    { opportunityId: "a", stage: "Strategy Call Complete", at: "2026-08-10" },
    { opportunityId: "a", stage: "Recruitment", at: "2026-08-12" },
    { opportunityId: "b", stage: "Interested", at: "2026-08-05" },
    { opportunityId: "b", stage: "Strategy Call Complete", at: "2026-08-20" },
  ];
  const interested = conversionRates(events).find((row) => row.label === "Interested → Strategy Call");
  assert.equal(interested?.fromCount, 2);
  assert.equal(interested?.toCount, 2);
  assert.equal(interested?.rate, 1);
  const recruitment = conversionRates(events).find((row) => row.label === "Strategy Call → Recruitment");
  assert.equal(recruitment?.fromCount, 2);
  assert.equal(recruitment?.toCount, 1);
  const duration = timeMetrics(events).find((row) => row.label === "Interested → Strategy Call");
  assert.equal(duration?.samples, 2);
  assert.equal(duration?.medianDays, median([9, 15]));
});
