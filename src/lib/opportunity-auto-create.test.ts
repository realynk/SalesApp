import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { planInterestedOpportunityCreate } from "./opportunity-auto-create.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const interested = {
  sendpilotStatus: "Interested",
  archived: false,
  existingOpportunityCount: 0,
};

test("creates when Interested and no opportunity exists", () => {
  assert.deepEqual(planInterestedOpportunityCreate(interested), { action: "create" });
});

test("skips when any opportunity already exists", () => {
  assert.deepEqual(
    planInterestedOpportunityCreate({ ...interested, existingOpportunityCount: 1 }),
    { action: "skip", reason: "duplicate" },
  );
});

test("skips Not Interested", () => {
  assert.deepEqual(
    planInterestedOpportunityCreate({ ...interested, sendpilotStatus: "Not Interested" }),
    { action: "skip", reason: "not_interested" },
  );
});

test("skips archived leads", () => {
  assert.deepEqual(
    planInterestedOpportunityCreate({ ...interested, archived: true }),
    { action: "skip", reason: "archived" },
  );
});

test("skips possible duplicates", () => {
  assert.deepEqual(
    planInterestedOpportunityCreate({ ...interested, possibleDuplicate: true }),
    { action: "skip", reason: "possible_duplicate" },
  );
});

test("write-time and reconciliation call sites use the planner", () => {
  const applySource = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
  const actionsSource = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const dataSource = readFileSync(join(root, "src/lib/data.ts"), "utf8");
  const importSource = readFileSync(join(root, "src/lib/sendpilot/import-server.ts"), "utf8");
  const startSource = readFileSync(join(root, "src/lib/opportunity-start.ts"), "utf8");
  assert.match(startSource, /planInterestedOpportunityCreate/);
  assert.match(startSource, /startOpportunityForLead/);
  assert.match(applySource, /maybeAutoCreateInterestedOpportunity/);
  assert.match(actionsSource, /maybeAutoCreateInterestedOpportunity/);
  assert.match(dataSource, /backfillMissingInterestedOpportunities/);
  assert.match(importSource, /backfillMissingInterestedOpportunities/);
});
