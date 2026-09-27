import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20260927133000_clear_sample_workspace.sql", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/(app)/dashboard/page.tsx", import.meta.url), "utf8");

test("clears only known demo identities and disables loading a sample workspace", () => {
  for (const email of [
    "elena.voss@northstarlegal.example",
    "marcus.hale@harborandco.example",
    "samir.haddad@plover.studio",
    "jordan.hale@northwind.example",
    "riley.chen@paperplane.example",
    "aisha.rahman@candidates.example",
  ]) {
    assert.match(sql, new RegExp(email.replace(".", "\\.")));
  }
  assert.match(sql, /Northstar Legal Group/);
  assert.match(sql, /clear_sample_workspace/);
  assert.match(sql, /sample_loaded_at = null/);
  assert.match(sql, /revoke all on function public.load_sample_workspace/);
  assert.doesNotMatch(dashboard, /Load sample workspace/);
  assert.doesNotMatch(dashboard, /loadSampleWorkspace/);
});
