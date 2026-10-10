import assert from "node:assert/strict";
import test from "node:test";
import {
  automationKey,
  defaultRecruitmentTarget,
  interviewReviewDue,
  leadHasResponded,
  nurtureSuggestionDue,
  planBookedCallTasks,
  planCandidateProfileFollowUp,
  planInterestedFollowUps,
  planInterviewDay,
  planInterviewFeedback,
  planSecondCandidateProfileFollowUp,
  planNurtureCheckIns,
  planSalesCallCompleteTasks,
  planSalesProfileFollowUps,
  planSecondInterestedFollowUp,
  planSignedSowTasks,
  planSowSignature,
  planTrialPeriodTasks,
  shouldSuggestNurture,
  typesToCancelOnStage,
} from "./pipeline-automation.ts";

test("interested first and second follow-ups use 3 business days", () => {
  const first = planInterestedFollowUps({ leadId: "lead-1", opportunityId: "opp-1", interestedOn: "2026-10-16" });
  assert.equal(first[0]?.dueOn, "2026-10-21");
  assert.equal(first[0]?.title, "First LinkedIn Follow-Up");
  const second = planSecondInterestedFollowUp({ leadId: "lead-1", opportunityId: "opp-1", firstCompletedOn: "2026-10-21" });
  assert.equal(second[0]?.dueOn, "2026-10-26");
});

test("nurture recommendation waits 3 business days after the second follow-up", () => {
  assert.equal(nurtureSuggestionDue("2026-10-26"), "2026-10-29");
  assert.equal(shouldSuggestNurture({ secondCompletedOn: "2026-10-26", today: "2026-10-28", responded: false }), false);
  assert.equal(shouldSuggestNurture({ secondCompletedOn: "2026-10-26", today: "2026-10-29", responded: false }), true);
  assert.equal(shouldSuggestNurture({ secondCompletedOn: "2026-10-26", today: "2026-10-29", responded: true }), false);
});

test("nurture check-ins are 30, 60, and 90 calendar days and then stop", () => {
  const rows = planNurtureCheckIns({ leadId: "lead-1", opportunityId: "opp-1", movedOn: "2026-10-16" });
  assert.deepEqual(rows.map((row) => row.dueOn), ["2026-11-15", "2026-12-15", "2027-01-14"]);
  assert.equal(rows.length, 3);
});

test("sales profile follow-ups are 3, 5, and 7 business days from the send date", () => {
  const rows = planSalesProfileFollowUps({ opportunityId: "opp-1", leadId: "lead-1", sentOn: "2026-10-16" });
  assert.deepEqual(rows.map((row) => row.dueOn), ["2026-10-21", "2026-10-23", "2026-10-27"]);
  assert.equal(new Set(rows.map((row) => row.key)).size, 3);
});

test("booked-call prep tasks share the day before the call and stay independently keyed", () => {
  const rows = planBookedCallTasks({ opportunityId: "opp-1", leadId: "lead-1", callOn: "2026-10-20" });
  assert.equal(rows[0]?.dueOn, "2026-10-19");
  assert.equal(rows[1]?.dueOn, "2026-10-19");
  assert.equal(rows[2]?.dueOn, "2026-10-20");
  assert.notEqual(rows[0]?.key, rows[1]?.key);
});

test("sales call complete creates notes and talent-request tasks only", () => {
  const rows = planSalesCallCompleteTasks({ opportunityId: "opp-1", leadId: "lead-1", callOn: "2026-10-16" });
  assert.deepEqual(rows.map((row) => row.title), [
    "Review and Approve Meeting Notes",
    "Send Talent Request to Recruitment",
  ]);
  assert.equal(rows.every((row) => row.dueOn === "2026-10-16"), true);
});

test("recruitment default target is 10 business days and Day 5 is a progress check", () => {
  assert.equal(defaultRecruitmentTarget("2026-10-16"), "2026-10-30");
  assert.equal(defaultRecruitmentTarget("2026-10-16", "2026-10-22"), "2026-10-22");
});

test("candidate profile second follow-up is based on first-task completion", () => {
  const first = planCandidateProfileFollowUp({ opportunityId: "opp-1", leadId: "lead-1", sentOn: "2026-10-16" });
  assert.equal(first[0]?.dueOn, "2026-10-21");
});

test("interview feedback uses the original interview date for the Day 7 review", () => {
  const first = planInterviewFeedback({
    interviewId: "int-1",
    opportunityId: "opp-1",
    leadId: "lead-1",
    interviewOn: "2026-10-16",
  });
  assert.equal(first[0]?.dueOn, "2026-10-20");
  assert.equal(interviewReviewDue("2026-10-16"), "2026-10-27");
});

test("SOW signature reminder moves a weekend landing to Friday", () => {
  const [row] = planSowSignature({ opportunityId: "opp-1", leadId: "lead-1", targetStartOn: "2026-10-20" });
  assert.equal(row?.dueOn, "2026-10-16");
});

test("late SOW signing marks HR and onboarding tasks urgent", () => {
  const late = planSignedSowTasks({
    opportunityId: "opp-1",
    leadId: "lead-1",
    targetStartOn: "2026-10-20",
    signedOn: "2026-10-19",
  });
  assert.equal(late.every((row) => row.urgent), true);
  const pending = planSignedSowTasks({
    opportunityId: "opp-1",
    leadId: "lead-1",
    targetStartOn: null,
    signedOn: "2026-10-19",
  });
  assert.equal(pending.every((row) => row.pendingSchedule), true);
});

test("trial period tasks stay pending schedule when shifts are unknown", () => {
  const rows = planTrialPeriodTasks({ opportunityId: "opp-1", leadId: "lead-1" });
  assert.equal(rows.length, 3);
  assert.equal(rows.every((row) => row.pendingSchedule && row.dueOn == null), true);
});

test("automation keys stay stable across repeats", () => {
  const a = planInterestedFollowUps({ leadId: "lead-1", opportunityId: "opp-1", interestedOn: "2026-10-16" });
  const b = planInterestedFollowUps({ leadId: "lead-1", opportunityId: "opp-1", interestedOn: "2026-10-20" });
  assert.equal(a[0]?.key, b[0]?.key);
  assert.equal(a[0]?.key, automationKey("interested_follow_1", "lead-1"));
});

test("candidate second follow-up is 3 business days after the first is completed", () => {
  const second = planSecondCandidateProfileFollowUp({
    opportunityId: "opp-1",
    leadId: "lead-1",
    firstCompletedOn: "2026-10-21",
  });
  assert.equal(second[0]?.dueOn, "2026-10-26");
});

test("interview day reminder omits the candidate name", () => {
  const [row] = planInterviewDay({
    interviewId: "int-1",
    opportunityId: "opp-1",
    leadId: "lead-1",
    interviewOn: "2026-10-20",
    clientName: "Pat Lee",
    interviewTime: "2:00 PM",
  });
  assert.match(row?.title ?? "", /Pat Lee/);
  assert.doesNotMatch(row?.title ?? "", /Nora|candidate/i);
});

test("a later SendPilot tag or sales activity counts as a response", () => {
  assert.equal(leadHasResponded({ sendpilotStatus: "Interested" }), false);
  assert.equal(leadHasResponded({ sendpilotStatus: "Meeting Booked" }), true);
  assert.equal(leadHasResponded({ activityTypes: ["email_received"] }), true);
  assert.equal(leadHasResponded({ opportunityStage: "Email / Profile Preparation" }), true);
});

test("saving a recruitment draft does not cancel the send-talent-request reminder", () => {
  const types = typesToCancelOnStage("Recruitment");
  assert.equal(types.includes("call_talent_request"), false);
  assert.ok(types.includes("call_notes"));
});

test("candidate selection cancels remaining interview follow-ups", () => {
  const types = typesToCancelOnStage("Candidate Selected");
  assert.ok(types.includes("interview_feedback_1"));
  assert.ok(types.includes("interview_feedback_2"));
  assert.ok(types.includes("interview_review_7"));
});
