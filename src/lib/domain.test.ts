import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  buildAttention,
  buildWeekTasks,
  weekStartMonday,
  conversionRates,
  mapImportRecords,
  median,
  normalizeSendPilotStatus,
  accountFlag,
  notInterestedColumn,
  notInterestedOutcome,
  boardStage,
  formatClock,
  isHiddenBoardStage,
  profileSendCheckBacks,
  salesCallCompleteTasks,
  stageLabel,
  potentialArr,
  potentialMrr,
  timeMetrics,
} from "./domain.ts";

test("labels the profile-send stage and defaults check-backs from the call", () => {
  assert.equal(stageLabel("Email / Profile Preparation"), "Sent Profiles to the client");
  assert.equal(stageLabel("Strategy Call Proposed"), "Booked Sales Call");
  assert.equal(stageLabel("Strategy Call Scheduled"), "Sales Call Complete");
  assert.equal(stageLabel("Strategy Call Complete"), "Sales Call Complete");
  assert.equal(stageLabel("Requirements Captured"), "Sales Call Complete");
  assert.equal(stageLabel("Recruitment"), "Recruitment");
  assert.equal(boardStage("Requirements Captured"), "Strategy Call Scheduled");
  assert.equal(boardStage("Profiles Ready"), "Recruitment");
  assert.equal(boardStage("Recruitment"), "Recruitment");
  assert.equal(stageLabel("Profiles Ready"), "Recruitment");
  assert.equal(isHiddenBoardStage("Strategy Call Complete"), true);
  assert.equal(isHiddenBoardStage("Profiles Ready"), true);
  assert.equal(boardStage("Client Review"), "Profiles Sent");
  assert.equal(stageLabel("Client Review"), "Profiles Sent");
  assert.equal(isHiddenBoardStage("Client Review"), true);
  assert.equal(stageLabel("Interview Complete"), "Interview Complete / Candidate Selected");
  assert.equal(stageLabel("Candidate Selected"), "Interview Complete / Candidate Selected");
  assert.equal(boardStage("Candidate Selected"), "Interview Complete");
  assert.equal(isHiddenBoardStage("Candidate Selected"), true);
  assert.equal(stageLabel("SOW Preparation"), "SOW Prep / Sent");
  assert.equal(stageLabel("SOW Sent"), "SOW Prep / Sent");
  assert.equal(boardStage("SOW Sent"), "SOW Preparation");
  assert.equal(isHiddenBoardStage("SOW Sent"), true);
  assert.equal(boardStage("SOW Negotiation"), "SOW Preparation");
  assert.equal(stageLabel("SOW Negotiation"), "SOW Prep / Sent");
  assert.equal(isHiddenBoardStage("SOW Negotiation"), true);
  assert.equal(stageLabel("Onboarding"), "Trial period");
  assert.equal(stageLabel("Won"), "Won");
  assert.deepEqual(salesCallCompleteTasks("2026-10-10"), [
    { title: "Send the meeting notes", dueOn: "2026-10-10" },
    { title: "Send the talent request to the recruitment team", dueOn: "2026-10-10" },
    { title: "Create a GC in Google Chat / Space", dueOn: "2026-10-10" },
  ]);
  assert.equal(formatClock("14:30"), "2:30 PM");
  assert.equal(formatClock("09:05"), "9:05 AM");
  assert.deepEqual(profileSendCheckBacks("2026-10-10", "2026-10-01"), { oneDay: "2026-10-11", twoDays: "2026-10-12" });
  assert.deepEqual(profileSendCheckBacks(null, "2026-10-01"), { oneDay: "2026-10-02", twoDays: "2026-10-03" });
});

test("accepts only known account flags", () => {
  assert.equal(accountFlag(null), null);
  assert.equal(accountFlag("Urgent"), "Urgent");
  assert.equal(accountFlag("Follow up"), "Follow up");
  assert.equal(accountFlag("Waiting on client"), "Waiting on client");
  assert.equal(accountFlag("Waiting on recruitment"), "Waiting on recruitment");
  assert.equal(accountFlag("At risk"), "At risk");
  assert.equal(accountFlag("hot"), null);
});

test("keeps unsorted Not Interested leads in the SendPilot intake column", () => {
  assert.equal(notInterestedOutcome(null), null);
  assert.equal(notInterestedOutcome("Stop"), "Stop");
  assert.equal(notInterestedOutcome("not the decision maker"), null);
  assert.equal(notInterestedColumn(null), "Not Interested");
  assert.equal(notInterestedColumn("Nurture"), "Nurture");
  assert.equal(notInterestedColumn("Stop"), "Stop");
});

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

test("places the week's calls, follow-ups, and SOW check-backs on their dates", () => {
  assert.equal(weekStartMonday("2026-09-23"), "2026-09-21");
  const tasks = buildWeekTasks({
    today: "2026-09-23",
    staleAfterDays: 10,
    profilesWaitingDays: 5,
    approachingWindowDays: 3,
    opportunities: [
      {
        id: "opp-harbor",
        title: "Harbor",
        companyName: "Harbor & Co. Accounting",
        stage: "Strategy Call Scheduled",
        status: "active",
        riskLevel: "low",
        waitingOn: "client",
        nextAction: "Hold the strategy call and capture requirements",
        nextActionDate: "2026-09-24",
        lastActivityOn: "2026-09-21",
      },
      {
        id: "opp-bright",
        title: "BrightPath",
        companyName: "BrightPath Mortgage",
        stage: "SOW Sent",
        status: "active",
        riskLevel: "medium",
        waitingOn: "client",
        nextAction: "Confirm Daniel has reviewed the SOW",
        nextActionDate: "2026-09-25",
        lastActivityOn: "2026-09-19",
      },
      {
        id: "opp-north",
        title: "Northstar",
        companyName: "Northstar Legal Group",
        stage: "Email / Profile Preparation",
        status: "active",
        riskLevel: "low",
        waitingOn: "internal",
        nextAction: "Send the firm profile and propose a strategy call",
        nextActionDate: "2026-09-23",
        lastActivityOn: "2026-09-22",
      },
    ],
    followUps: [
      {
        id: "fu-1",
        opportunityId: "opp-north",
        leadId: "lead-north",
        title: "Send the firm profile and propose a strategy call",
        dueOn: "2026-09-23",
        status: "open",
        companyName: "Northstar Legal Group",
      },
    ],
    profileBatches: [],
    recruitment: [],
    interviews: [
      {
        id: "int-1",
        opportunityId: "opp-cedar",
        candidateName: "Nora Feldman",
        companyName: "Hannah Brooks",
        interviewOn: "2026-09-24",
        status: "Scheduled",
      },
    ],
    contracts: [
      { opportunityId: "opp-bright", companyName: "BrightPath Mortgage", status: "Sent", expectedStartOn: "2026-10-14" },
    ],
    strategyCalls: [
      { opportunityId: "opp-harbor", companyName: "Harbor & Co. Accounting", callOn: "2026-09-24", status: "Scheduled" },
    ],
    unmatchedInterested: [],
  });

  const harbor = tasks.find((task) => task.company === "Harbor & Co. Accounting" && task.date === "2026-09-24");
  assert.equal(harbor?.kind, "strategy_call");
  assert.equal(harbor?.title, "Hold the strategy call and capture requirements");
  assert.equal(tasks.filter((task) => task.id.startsWith("next-opp-north")).length, 0);
  assert.equal(tasks.find((task) => task.company === "Northstar Legal Group")?.kind, "follow_up");
  assert.equal(tasks.find((task) => task.company === "BrightPath Mortgage" && task.date === "2026-09-25")?.kind, "sow");
  assert.equal(tasks.find((task) => task.kind === "interview")?.title, "Nora Feldman");
  assert.equal(tasks.find((task) => task.kind === "start")?.date, "2026-10-14");
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
