import assert from "node:assert/strict";
import test from "node:test";
import { isNavActive } from "./nav.ts";

test("Leads stays active on a lead, not on Import leads", () => {
  assert.equal(isNavActive("/leads", "/leads"), true);
  assert.equal(isNavActive("/leads/abc", "/leads"), true);
  assert.equal(isNavActive("/leads/import", "/leads"), false);
  assert.equal(isNavActive("/leads/import", "/leads/import"), true);
  assert.equal(isNavActive("/reconciliation", "/leads"), false);
});
