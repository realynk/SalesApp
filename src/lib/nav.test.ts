import assert from "node:assert/strict";
import test from "node:test";
import { attentionBadgeCount, isNavActive, navItemsForAccess } from "./nav.ts";

test("Import leads is hidden for view-only navigation", () => {
  assert.equal(navItemsForAccess(true).some((item) => item.href === "/leads/import"), true);
  assert.equal(navItemsForAccess(false).some((item) => item.href === "/leads/import"), false);
  assert.deepEqual(
    navItemsForAccess(false).map((item) => item.href),
    ["/dashboard", "/notifications", "/opportunities", "/reporting", "/leads", "/reconciliation", "/settings"],
  );
});

test("Leads stays active on a lead, not on Import leads", () => {
  assert.equal(isNavActive("/leads", "/leads"), true);
  assert.equal(isNavActive("/leads/abc", "/leads"), true);
  assert.equal(isNavActive("/leads/import", "/leads"), false);
  assert.equal(isNavActive("/leads/import", "/leads/import"), true);
  assert.equal(isNavActive("/reconciliation", "/leads"), false);
});

test("Attention badge counts actionable items only", () => {
  assert.equal(
    attentionBadgeCount([
      { sections: ["needs"] },
      { sections: ["upcoming"] },
      { sections: ["waiting_recruitment", "upcoming"] },
      { sections: ["stale"] },
    ]),
    2,
  );
});
