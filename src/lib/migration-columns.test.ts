import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_MIGRATION_REQUIRED,
  UX_MIGRATION_REQUIRED,
  isCountableProfileBatch,
  resolvedProfileCount,
  writeFailureMessage,
} from "./migration-columns.ts";

test("failed UX column writes are not reported as success", () => {
  assert.equal(
    writeFailureMessage({ code: "PGRST204", message: "Could not find the 'talent_request_draft' column" }, "fallback"),
    UX_MIGRATION_REQUIRED,
  );
  assert.equal(
    writeFailureMessage({ message: "column next_action_manual does not exist" }, "fallback"),
    UX_MIGRATION_REQUIRED,
  );
});

test("failed automation column writes ask for the automation migration", () => {
  assert.equal(
    writeFailureMessage({ message: "Could not find the 'automation_key' column of 'follow_ups'" }, "fallback"),
    AUTOMATION_MIGRATION_REQUIRED,
  );
});

test("other write failures keep the database message", () => {
  assert.equal(writeFailureMessage({ message: "permission denied" }, "fallback"), "permission denied");
});

test("candidate profile counts reject empty batches", () => {
  assert.equal(resolvedProfileCount([], "0"), 0);
  assert.equal(resolvedProfileCount([], "2"), 2);
  assert.equal(resolvedProfileCount(["a", "b"], "9"), 2);
  assert.equal(isCountableProfileBatch({ profileCount: 0 }), false);
  assert.equal(isCountableProfileBatch({ profileCount: 3 }), true);
});
