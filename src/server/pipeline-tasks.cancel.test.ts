import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { automationKey } from "../lib/pipeline-automation.ts";
import {
  cancelAutomationTypes,
  cancelInterestedAutomationForLead,
  LEAD_RESPONSE_AUTOMATION_TYPES,
} from "./pipeline-tasks.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPP_A = "11111111-1111-4111-8111-111111111111";
const OPP_B = "22222222-2222-4222-8222-222222222222";
const FOLLOW_A = "33333333-3333-4333-8333-333333333333";
const FOLLOW_B = "44444444-4444-4444-8444-444444444444";
const TASK_A = "55555555-5555-4555-8555-555555555555";
const TASK_B = "66666666-6666-4666-8666-666666666666";
const TASK_A_KEY_ONLY = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in"; col: string; value: unknown };

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    if (filter.op === "eq") return row[filter.col] === filter.value;
    return Array.isArray(filter.value) && filter.value.includes(row[filter.col]);
  });
}

function createMemoryDb(state: { follow_ups: Row[]; tasks: Row[]; opportunities: Row[] }) {
  const taskUpdates: Filter[][] = [];
  function from(table: "follow_ups" | "tasks" | "opportunities") {
    let action: "select" | "update" = "select";
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
      eq(col: string, value: unknown) {
        filters.push({ op: "eq", col, value });
        return chain;
      },
      in(col: string, value: unknown[]) {
        filters.push({ op: "in", col, value });
        return chain;
      },
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onFulfilled, onRejected);
      },
    };
    function run() {
      if (action === "update") {
        if (table === "tasks") taskUpdates.push(filters.slice());
        for (const row of state[table]) {
          if (matches(row, filters)) Object.assign(row, patch);
        }
        return { data: null, error: null };
      }
      return { data: state[table].filter((row) => matches(row, filters)), error: null };
    }
    return chain;
  }
  return { from, taskUpdates, state };
}

function seedPair() {
  return {
    opportunities: [
      { id: OPP_A, lead_id: LEAD_A },
      { id: OPP_B, lead_id: LEAD_B },
    ],
    follow_ups: [
      {
        id: FOLLOW_A,
        lead_id: LEAD_A,
        opportunity_id: OPP_A,
        automation_type: "interested_follow_1",
        automation_key: automationKey("interested_follow_1", LEAD_A),
        status: "open",
      },
      {
        id: FOLLOW_B,
        lead_id: LEAD_B,
        opportunity_id: OPP_B,
        automation_type: "interested_follow_1",
        automation_key: automationKey("interested_follow_1", LEAD_B),
        status: "open",
      },
    ],
    tasks: [
      {
        id: TASK_A,
        opportunity_id: OPP_A,
        follow_up_id: FOLLOW_A,
        automation_type: "interested_follow_1",
        automation_key: automationKey("interested_follow_1", LEAD_A),
        status: "open",
      },
      {
        id: TASK_B,
        opportunity_id: OPP_B,
        follow_up_id: FOLLOW_B,
        automation_type: "interested_follow_1",
        automation_key: automationKey("interested_follow_1", LEAD_B),
        status: "open",
      },
      {
        id: TASK_A_KEY_ONLY,
        opportunity_id: null,
        follow_up_id: null,
        automation_type: "nurture_suggest",
        automation_key: automationKey("nurture_suggest", LEAD_A),
        status: "open",
      },
    ],
  };
}

function asClient(db: ReturnType<typeof createMemoryDb>) {
  return db as unknown as SupabaseClient;
}

test("lead-only cancel updates Lead A and leaves Lead B tasks open", async () => {
  const db = createMemoryDb(seedPair());
  await cancelAutomationTypes(asClient(db), {
    leadId: LEAD_A,
    types: [...LEAD_RESPONSE_AUTOMATION_TYPES],
  });
  const taskA = db.state.tasks.find((row) => row.id === TASK_A);
  const taskB = db.state.tasks.find((row) => row.id === TASK_B);
  const keyOnly = db.state.tasks.find((row) => row.id === TASK_A_KEY_ONLY);
  const followB = db.state.follow_ups.find((row) => row.id === FOLLOW_B);
  assert.equal(taskA?.status, "cancelled");
  assert.equal(keyOnly?.status, "cancelled");
  assert.equal(taskB?.status, "open");
  assert.equal(followB?.status, "open");
});

test("SendPilot webhook path cannot cancel another lead's tasks", async () => {
  const db = createMemoryDb(seedPair());
  await cancelInterestedAutomationForLead(asClient(db), LEAD_A);
  assert.equal(db.state.tasks.find((row) => row.id === TASK_B)?.status, "open");
  assert.equal(db.state.tasks.find((row) => row.id === TASK_A)?.status, "cancelled");
});

test("manual lead-status path cannot cancel another lead's tasks", async () => {
  const db = createMemoryDb(seedPair());
  await cancelInterestedAutomationForLead(asClient(db), LEAD_A);
  assert.equal(db.state.follow_ups.find((row) => row.id === FOLLOW_B)?.status, "open");
  assert.equal(db.state.tasks.find((row) => row.id === TASK_B)?.status, "open");
});

test("opportunity-scoped cancel does not touch another opportunity", async () => {
  const db = createMemoryDb(seedPair());
  await cancelAutomationTypes(asClient(db), {
    opportunityId: OPP_A,
    types: ["interested_follow_1"],
  });
  assert.equal(db.state.tasks.find((row) => row.id === TASK_A)?.status, "cancelled");
  assert.equal(db.state.tasks.find((row) => row.id === TASK_B)?.status, "open");
});

test("cancel without opportunity or lead never updates tasks", async () => {
  const db = createMemoryDb(seedPair());
  await cancelAutomationTypes(asClient(db), { types: [...LEAD_RESPONSE_AUTOMATION_TYPES] });
  await cancelInterestedAutomationForLead(asClient(db), "not-a-uuid");
  assert.equal(db.taskUpdates.length, 0);
  assert.equal(db.state.tasks.every((row) => row.status === "open"), true);
});

test("every task update carries a lead, opportunity, key, or follow-up scope", async () => {
  const db = createMemoryDb(seedPair());
  await cancelInterestedAutomationForLead(asClient(db), LEAD_A);
  assert.ok(db.taskUpdates.length > 0);
  for (const filters of db.taskUpdates) {
    const scoped = filters.some(
      (filter) =>
        (filter.col === "opportunity_id" ||
          filter.col === "automation_key" ||
          filter.col === "follow_up_id" ||
          filter.col === "lead_id") &&
        (filter.op === "eq" || filter.op === "in"),
    );
    assert.equal(scoped, true);
  }
});

test("webhook and manual status callers use the lead-scoped helper", () => {
  const apply = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  assert.match(apply, /cancelInterestedAutomationForLead\(supabase, lead\.leadId\)/);
  assert.match(actions, /cancelInterestedAutomationForLead\(supabase, leadId\)/);
  assert.equal(apply.includes("cancelAutomationTypes"), false);
});

test("remaining cancelAutomationTypes callers pass an opportunity id", () => {
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const calls = [...actions.matchAll(/cancelAutomationTypes\(supabase, \{([^}]+)\}/g)].map((match) => match[1]);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.match(call, /opportunityId/);
  }
});
