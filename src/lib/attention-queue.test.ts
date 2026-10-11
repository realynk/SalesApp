import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttention } from "./domain.ts";
import {
  attentionBadgeFromQueue,
  attentionQueueCounts,
  buildAttentionQueue,
  canMarkFollowUpDone,
  commandCenterPriorities,
  filterAttentionQueue,
} from "./attention-queue.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const followA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  opportunityId: "11111111-1111-4111-8111-111111111111",
  leadId: "lead-a",
  title: "First LinkedIn Follow-Up",
  dueOn: "2026-10-09",
  status: "open" as const,
  companyName: "Acme",
  automationType: "interested_follow_1",
};

const followB = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  opportunityId: "22222222-2222-4222-8222-222222222222",
  leadId: "lead-b",
  title: "First LinkedIn Follow-Up",
  dueOn: "2026-10-09",
  status: "open" as const,
  companyName: "Beta",
  automationType: "interested_follow_1",
};

function sampleAttention() {
  return buildAttention({
    today: "2026-10-10",
    staleAfterDays: 10,
    profilesWaitingDays: 5,
    approachingWindowDays: 3,
    opportunities: [
      {
        id: followA.opportunityId,
        title: "Acme",
        companyName: "Acme",
        stage: "Interested",
        status: "active",
        riskLevel: "low",
        waitingOn: "internal",
        nextAction: "First LinkedIn Follow-Up",
        nextActionDate: "2026-10-09",
        lastActivityOn: "2026-10-08",
      },
    ],
    followUps: [followA, followB],
    profileBatches: [],
    recruitment: [],
    interviews: [],
    contracts: [],
    strategyCalls: [],
    unmatchedInterested: [],
  });
}

test("Mark Done is blocked for required workflow reminders", () => {
  assert.equal(canMarkFollowUpDone("interested_follow_1"), true);
  assert.equal(canMarkFollowUpDone("nurture_suggest"), true);
  assert.equal(canMarkFollowUpDone("call_day"), false);
  assert.equal(canMarkFollowUpDone("call_talent_request"), false);
  assert.equal(canMarkFollowUpDone("interview_day"), false);
  assert.equal(canMarkFollowUpDone("sow_confirm_start"), false);
});

test("queue keeps one row per follow-up and drops the matching next-action copy", () => {
  const attention = sampleAttention();
  const queue = buildAttentionQueue({ today: "2026-10-10", attention, followUps: [followA, followB] });
  const acme = queue.filter((item) => item.companyName.includes("Acme") || item.title.includes("LinkedIn"));
  assert.equal(queue.filter((item) => item.followUpId === followA.id).length, 1);
  assert.equal(queue.some((item) => item.id === `next-${followA.opportunityId}`), false);
  assert.ok(acme.length >= 1);
});

test("Lead B stays on the queue when Lead A is completed", () => {
  const attention = sampleAttention();
  const queue = buildAttentionQueue({
    today: "2026-10-10",
    attention,
    followUps: [{ ...followA, status: "completed" }, followB],
    completedFollowUps: [{ ...followA, status: "completed", completedAt: "2026-10-10T15:00:00.000Z" }],
  });
  assert.equal(queue.some((item) => item.followUpId === followA.id && item.view === "completed"), true);
  assert.equal(queue.some((item) => item.followUpId === followB.id && item.view !== "completed"), true);
  assert.equal(filterAttentionQueue(queue, "open").some((item) => item.followUpId === followA.id), false);
});

test("Command Center counts match Attention open buckets", () => {
  const attention = sampleAttention();
  const queue = buildAttentionQueue({ today: "2026-10-10", attention, followUps: [followA, followB] });
  const counts = attentionQueueCounts(queue);
  const filtered = filterAttentionQueue(queue, "overdue").length;
  assert.equal(counts.overdue, filtered);
  assert.equal(counts.open, filterAttentionQueue(queue, "open").length);
  const priorities = commandCenterPriorities(counts);
  assert.equal(priorities.length, 3);
  assert.equal(attentionBadgeFromQueue(counts), counts.overdue + counts.today);
});

test("completed items stay out of the active list after a rebuild", () => {
  const completed = { ...followA, status: "completed" as const, completedAt: "2026-10-10T12:00:00.000Z" };
  const first = buildAttentionQueue({ today: "2026-10-10", attention: [], followUps: [completed], completedFollowUps: [completed] });
  const refresh = buildAttentionQueue({ today: "2026-10-10", attention: [], followUps: [completed], completedFollowUps: [completed] });
  assert.deepEqual(
    filterAttentionQueue(first, "open").map((item) => item.followUpId),
    filterAttentionQueue(refresh, "open").map((item) => item.followUpId),
  );
  assert.equal(filterAttentionQueue(refresh, "open").length, 0);
  assert.equal(filterAttentionQueue(refresh, "completed").length, 1);
});

test("a follow-up covers the matching interview and profile signals", () => {
  const attention = buildAttention({
    today: "2026-10-10",
    staleAfterDays: 10,
    profilesWaitingDays: 1,
    approachingWindowDays: 7,
    opportunities: [
      {
        id: "opp-1",
        title: "Acme",
        companyName: "Acme",
        stage: "Interview Scheduled",
        status: "active",
        riskLevel: "low",
        waitingOn: "client",
        nextAction: "Interview scheduled",
        nextActionDate: "2026-10-10",
        lastActivityOn: "2026-10-09",
      },
    ],
    followUps: [
      {
        id: "fu-int",
        opportunityId: "opp-1",
        leadId: "lead-1",
        title: "Interview scheduled — Acme · 2026-10-10",
        dueOn: "2026-10-10",
        status: "open",
        companyName: "Acme",
        automationType: "interview_day",
      },
    ],
    profileBatches: [
      {
        id: "batch-1",
        opportunityId: "opp-1",
        companyName: "Acme",
        sentOn: "2026-10-01",
        profileCount: 2,
        clientResponse: null,
        followUpOn: "2026-10-04",
      },
    ],
    recruitment: [],
    interviews: [
      {
        id: "int-1",
        opportunityId: "opp-1",
        candidateName: "Pat",
        companyName: "Acme",
        interviewOn: "2026-10-10",
        status: "Scheduled",
      },
    ],
    contracts: [],
    strategyCalls: [],
    unmatchedInterested: [],
  });
  const queue = buildAttentionQueue({
    today: "2026-10-10",
    attention,
    followUps: [
      {
        id: "fu-int",
        opportunityId: "opp-1",
        leadId: "lead-1",
        title: "Interview scheduled — Acme · 2026-10-10",
        dueOn: "2026-10-10",
        status: "open",
        companyName: "Acme",
        automationType: "interview_day",
      },
    ],
  });
  assert.equal(queue.filter((item) => item.followUpId === "fu-int").length, 1);
  assert.equal(queue.some((item) => item.id === "interview-int-1"), false);
});

test("pending-schedule follow-ups use their due date instead of Due today", () => {
  const queue = buildAttentionQueue({
    today: "2026-10-10",
    attention: [],
    followUps: [
      {
        id: "fu-pend",
        opportunityId: "opp-1",
        leadId: "lead-1",
        title: "Onboarding Preparation",
        dueOn: "2026-10-20",
        status: "open",
        companyName: "Acme",
        pendingSchedule: true,
        automationType: "onboarding_prep",
      },
    ],
  });
  assert.equal(queue[0]?.view, "upcoming");
  assert.equal(attentionQueueCounts(queue).today, 0);
});

test("recruitment follow-up suppresses the recruitment alert for the same opportunity", () => {
  const attention = buildAttention({
    today: "2026-10-10",
    staleAfterDays: 10,
    profilesWaitingDays: 5,
    approachingWindowDays: 7,
    opportunities: [
      {
        id: "opp-1",
        title: "Acme",
        companyName: "Acme",
        stage: "Recruitment",
        status: "active",
        riskLevel: "low",
        waitingOn: "recruitment",
        nextAction: "Recruitment Progress Check",
        nextActionDate: "2026-10-08",
        lastActivityOn: "2026-10-08",
      },
    ],
    followUps: [
      {
        id: "fu-rec",
        opportunityId: "opp-1",
        leadId: "lead-1",
        title: "Recruitment Progress Check",
        dueOn: "2026-10-08",
        status: "open",
        companyName: "Acme",
        automationType: "recruitment_progress",
      },
    ],
    profileBatches: [],
    recruitment: [{ id: "req-1", opportunityId: "opp-1", companyName: "Acme", status: "Sourcing", targetOn: "2026-10-08" }],
    interviews: [],
    contracts: [],
    strategyCalls: [],
    unmatchedInterested: [],
  });
  const queue = buildAttentionQueue({
    today: "2026-10-10",
    attention,
    followUps: [
      {
        id: "fu-rec",
        opportunityId: "opp-1",
        leadId: "lead-1",
        title: "Recruitment Progress Check",
        dueOn: "2026-10-08",
        status: "open",
        companyName: "Acme",
        automationType: "recruitment_progress",
      },
    ],
  });
  assert.equal(queue.filter((item) => item.followUpId === "fu-rec").length, 1);
  assert.equal(queue.some((item) => item.id === "recruitment-req-1"), false);
});

test("week calendar is planning-only and does not complete work", () => {
  const calendar = readFileSync(join(root, "src/components/week-calendar.tsx"), "utf8");
  assert.equal(calendar.includes("completeFollowUp"), false);
  assert.match(calendar, /Mark work done on Attention/);
});

test("write actions stay behind requireWriter and do not unscoped-cancel", () => {
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const tasks = readFileSync(join(root, "src/server/pipeline-tasks.ts"), "utf8");
  assert.match(actions, /export async function completeFollowUp[\s\S]*?requireWriter/);
  assert.match(actions, /export async function reopenFollowUp[\s\S]*?requireWriter/);
  assert.match(actions, /canMarkFollowUpDone/);
  assert.match(tasks, /if \(!opportunityId && !leadId\) return/);
});
