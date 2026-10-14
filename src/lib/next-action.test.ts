import assert from "node:assert/strict";
import test from "node:test";
import { earliestOpenWorkItem, resolveNextAction } from "./next-action.ts";

test("earliest open task ignores completed and canceled items", () => {
  const next = earliestOpenWorkItem([
    { title: "Done item", dueOn: "2026-10-10", status: "completed" },
    { title: "Canceled", dueOn: "2026-10-11", status: "cancelled" },
    { title: "Second LinkedIn Follow-Up", dueOn: "2026-10-16", status: "open" },
    { title: "First LinkedIn Follow-Up", dueOn: "2026-10-14", status: "open" },
  ]);
  assert.equal(next?.title, "First LinkedIn Follow-Up");
  assert.equal(next?.dueOn, "2026-10-14");
});

test("manual next action is kept until cleared", () => {
  const overridden = resolveNextAction({
    manual: true,
    manualTitle: "Call the founder",
    manualDate: "2026-10-12",
    openItems: [{ title: "First LinkedIn Follow-Up", dueOn: "2026-10-14", status: "open" }],
  });
  assert.equal(overridden.source, "manual");
  assert.equal(overridden.title, "Call the founder");
  const automatic = resolveNextAction({
    manual: false,
    manualTitle: "Call the founder",
    openItems: [{ title: "First LinkedIn Follow-Up", dueOn: "2026-10-14", status: "open" }],
  });
  assert.equal(automatic.source, "task");
  assert.equal(automatic.title, "First LinkedIn Follow-Up");
});
