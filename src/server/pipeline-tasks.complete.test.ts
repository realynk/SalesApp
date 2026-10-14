import assert from "node:assert/strict";
import test from "node:test";
import { automationKey } from "../lib/pipeline-automation.ts";
import { completeLinkedTaskRecords, reopenLinkedTaskRecords, upsertAutomationTasks } from "./pipeline-tasks.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPP_A = "11111111-1111-4111-8111-111111111111";
const FOLLOW_A = "33333333-3333-4333-8333-333333333333";
const FOLLOW_B = "44444444-4444-4444-8444-444444444444";
const TASK_A = "55555555-5555-4555-8555-555555555555";
const TASK_B = "66666666-6666-4666-8666-666666666666";
const USER = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in"; col: string; value: unknown };

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    if (filter.op === "eq") return row[filter.col] === filter.value;
    return Array.isArray(filter.value) && filter.value.includes(row[filter.col]);
  });
}

function createMemoryDb(state: { follow_ups: Row[]; tasks: Row[]; opportunities: Row[] }) {
  function from(table: "follow_ups" | "tasks" | "opportunities") {
    let action: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    const filters: Filter[] = [];
    const chain = {
      select() {
        action = "select";
        return chain;
      },
      update(next: Row) {
        action = "update";
        patch = next;
        return chain;
      },
      insert() {
        action = "insert";
        return chain;
      },
      eq(col: string, value: unknown) {
        filters.push({ op: "eq", col, value });
        return chain;
      },
      in(col: string, value: unknown[]) {
        filters.push({ op: "in", col, value });
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(run()).then((result) => ({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          error: result.error,
        }));
      },
      single() {
        return chain.maybeSingle();
      },
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onFulfilled, onRejected);
      },
    };
    function run() {
      if (action === "update") {
        for (const row of state[table]) {
          if (matches(row, filters)) Object.assign(row, patch);
        }
        return { data: null, error: null };
      }
      if (action === "insert") return { data: null, error: null };
      return { data: state[table].filter((row) => matches(row, filters)), error: null };
    }
    return chain;
  }
  return { from, state };
}

function seed() {
  const keyA = automationKey("interested_follow_1", LEAD_A);
  const keyB = automationKey("interested_follow_1", LEAD_B);
  return {
    opportunities: [{ id: OPP_A, lead_id: LEAD_A, next_action_manual: false }],
    follow_ups: [
      { id: FOLLOW_A, lead_id: LEAD_A, opportunity_id: OPP_A, automation_key: keyA, automation_type: "interested_follow_1", status: "open", completed_at: null, completed_by: null },
      { id: FOLLOW_B, lead_id: LEAD_B, opportunity_id: null, automation_key: keyB, automation_type: "interested_follow_1", status: "open", completed_at: null, completed_by: null },
    ],
    tasks: [
      { id: TASK_A, opportunity_id: OPP_A, follow_up_id: FOLLOW_A, automation_key: keyA, status: "open" },
      { id: TASK_B, opportunity_id: null, follow_up_id: FOLLOW_B, automation_key: keyB, status: "open" },
    ],
  };
}

function asClient(db: ReturnType<typeof createMemoryDb>) {
  return db as unknown as SupabaseClient;
}

test("completing Lead A syncs the linked task and leaves Lead B open", async () => {
  const db = createMemoryDb(seed());
  await completeLinkedTaskRecords(asClient(db), FOLLOW_A, USER);
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_A)?.status, "completed");
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_A)?.completed_by, USER);
  assert.equal(db.state.tasks.find((row) => row.id === TASK_A)?.status, "done");
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_B)?.status, "open");
  assert.equal(db.state.tasks.find((row) => row.id === TASK_B)?.status, "open");
});

test("reopening restores the follow-up and linked task", async () => {
  const db = createMemoryDb(seed());
  await completeLinkedTaskRecords(asClient(db), FOLLOW_A, USER);
  await reopenLinkedTaskRecords(asClient(db), FOLLOW_A);
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_A)?.status, "open");
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_A)?.completed_at, null);
  assert.equal(db.state.tasks.find((row) => row.id === TASK_A)?.status, "open");
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_B)?.status, "open");
});

test("upsert does not reopen a completed automation key", async () => {
  const db = createMemoryDb(seed());
  await completeLinkedTaskRecords(asClient(db), FOLLOW_A, USER);
  await upsertAutomationTasks(asClient(db), USER, [
    {
      key: automationKey("interested_follow_1", LEAD_A),
      type: "interested_follow_1",
      title: "First LinkedIn Follow-Up",
      dueOn: "2026-10-16",
      pendingSchedule: false,
      urgent: false,
      opportunityId: OPP_A,
      leadId: LEAD_A,
    },
  ]);
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_A)?.status, "completed");
  assert.equal(db.state.tasks.find((row) => row.id === TASK_A)?.status, "done");
});
