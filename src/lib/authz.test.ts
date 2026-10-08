import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  authorizeCrmWrite,
  canManageWorkspace,
  canWriteCrm,
  CRM_WRITE_DENIED,
  isUserRole,
} from "./authz.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(join(root, "supabase/migrations/20261008020000_executive_role_security.sql"), "utf8");
const sessionSource = readFileSync(join(root, "src/server/session.ts"), "utf8");
const actionsSource = readFileSync(join(root, "src/server/actions.ts"), "utf8");
const importApply = readFileSync(join(root, "src/app/api/sendpilot/import/apply/route.ts"), "utf8");
const importPreview = readFileSync(join(root, "src/app/api/sendpilot/import/preview/route.ts"), "utf8");
const dataSource = readFileSync(join(root, "src/lib/data.ts"), "utf8");
const webhookApply = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
const webhookRoute = readFileSync(join(root, "src/app/api/sendpilot/webhook/route.ts"), "utf8");
const reportingLoad = readFileSync(join(root, "src/lib/reporting-load.ts"), "utf8");
const reportingPage = readFileSync(join(root, "src/app/(app)/reporting/page.tsx"), "utf8");

test("sales_lead keeps write and workspace-admin access", () => {
  assert.equal(canWriteCrm("sales_lead"), true);
  assert.equal(canManageWorkspace("sales_lead"), true);
  assert.deepEqual(authorizeCrmWrite("sales_lead"), { ok: true });
});

test("executive is a known role and cannot write CRM data", () => {
  assert.equal(isUserRole("executive"), true);
  assert.equal(canWriteCrm("executive"), false);
  assert.equal(canManageWorkspace("executive"), false);
  assert.deepEqual(authorizeCrmWrite("executive"), { ok: false, error: CRM_WRITE_DENIED });
});

test("member and recruiter are also non-writers", () => {
  assert.equal(canWriteCrm("member"), false);
  assert.equal(canWriteCrm("recruiter"), false);
  assert.equal(canWriteCrm(null), false);
});

test("authorization uses profiles.role helpers and not user_metadata", () => {
  assert.match(sessionSource, /authorizeCrmWrite\(session\.profile\?\.role\)/);
  assert.equal(sessionSource.includes("user_metadata"), false);
  assert.match(actionsSource, /requireWriter/);
  assert.match(importApply, /canWriteCrm\(\(profile as \{ role\?: string \}\)\.role\)/);
  assert.match(importPreview, /canWriteCrm\(\(profile as \{ role\?: string \}\)\.role\)/);
});

test("reporting dashboard is read-only and does not call requireWriter", () => {
  assert.match(reportingLoad, /requireUser/);
  assert.equal(reportingLoad.includes("requireWriter"), false);
  assert.equal(reportingPage.includes("requireWriter"), false);
  assert.equal(reportingPage.includes("ActionForm"), false);
  assert.match(reportingPage, /getReportingDashboard/);
});

test("reconciliation backfill does not run for view-only roles", () => {
  assert.match(dataSource, /canWriteCrm\(profile\?\.role\)/);
  assert.match(dataSource, /backfillMissingInterestedOpportunities/);
});

test("migration adds executive, defaults new users to member, and does not rewrite existing roles", () => {
  assert.match(migration, /add value if not exists 'executive'/i);
  assert.match(migration, /alter column role set default 'member'/i);
  assert.match(migration, /'member'/);
  assert.match(migration, /private\.handle_new_user/);
  assert.doesNotMatch(migration, /update\s+public\.profiles/i);
  assert.doesNotMatch(migration, /set\s+role\s*=/i);
});

test("migration locks CRM writes to sales_lead and keeps select for every internal profile", () => {
  assert.match(migration, /private\.can_write\(\)/);
  assert.match(migration, /role = 'sales_lead'::public.user_role/);
  assert.match(migration, /SELECT policies stay private\.is_internal\(\)/);
  assert.match(migration, /with check \(\(select private\.can_write\(\)\)\)/);
  assert.match(migration, /'leads', 'opportunities'/);
  assert.match(migration, /'sendpilot_records'/);
  assert.match(migration, /'app_settings'/);
  assert.match(migration, /table_name \|\| '_insert'/);
  assert.match(migration, /sendpilot_suppressions_insert/);
});

test("migration wraps write RPCs and preserves last sales_lead", () => {
  assert.match(migration, /private\.can_write\(\)/);
  assert.match(migration, /delete_lead_permanently/);
  assert.match(migration, /load_sample_workspace/);
  assert.match(migration, /apply_sendpilot_import/);
  assert.match(migration, /update_opportunity_stage/);
  assert.match(migration, /count\(\*\) filter \(where role = 'sales_lead'::public.user_role\)/);
  assert.match(migration, /new\.role := old\.role/);
});

test("private write impls are not executable by authenticated or anon", () => {
  const impls = [
    "private.apply_sendpilot_import_impl(jsonb)",
    "private.update_opportunity_stage_impl(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text)",
    "private.start_client_impl(uuid, date, integer, numeric, text)",
    "private.load_sample_workspace_impl()",
  ];
  for (const impl of impls) {
    assert.match(migration, new RegExp(`revoke all on function ${impl.replace(/[().]/g, "\\$&")} from public, anon, authenticated;`));
  }
  assert.doesNotMatch(migration, /grant execute on function private\.(apply_sendpilot_import_impl|update_opportunity_stage_impl|start_client_impl|load_sample_workspace_impl)/);
});

test("public write wrappers are security definer and still check can_write", () => {
  assert.match(migration, /create or replace function public\.apply_sendpilot_import[\s\S]*?security definer[\s\S]*?private\.can_write\(\)/);
  assert.match(migration, /create or replace function public\.update_opportunity_stage[\s\S]*?security definer[\s\S]*?private\.can_write\(\)/);
  assert.match(migration, /create or replace function public\.start_client[\s\S]*?security definer[\s\S]*?private\.can_write\(\)/);
  assert.match(migration, /create or replace function public\.load_sample_workspace[\s\S]*?security definer[\s\S]*?private\.can_write\(\)/);
  assert.match(migration, /grant execute on function public\.apply_sendpilot_import\(jsonb\) to authenticated/);
});

test("rollback notes keep member defaults and do not rewrite admin profiles", () => {
  const rollback = readFileSync(join(root, "supabase/migrations/20261008020000_executive_role_security.rollback.md"), "utf8");
  assert.match(rollback, /Restore previous RPC definitions/);
  assert.match(rollback, /Restore previous RLS write policies/);
  assert.match(rollback, /handle_new_user/);
  assert.match(rollback, /Do \*\*not\*\* try to remove `executive`/);
  assert.match(rollback, /Do \*\*not\*\* `UPDATE public\.profiles`/);
  assert.match(rollback, /Keep public email signup disabled/);
  assert.match(rollback, /Roll back the \*\*application\*\*/);
});

test("app layout and write surfaces gate executives in the UI", () => {
  const layout = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
  const leads = readFileSync(join(root, "src/app/(app)/leads/page.tsx"), "utf8");
  const dashboard = readFileSync(join(root, "src/app/(app)/dashboard/page.tsx"), "utf8");
  const settings = readFileSync(join(root, "src/app/(app)/settings/page.tsx"), "utf8");
  const pipeline = readFileSync(join(root, "src/components/pipeline-board.tsx"), "utf8");
  const menu = readFileSync(join(root, "src/components/lead-actions-menu.tsx"), "utf8");
  assert.match(layout, /WorkspaceAccessProvider canWrite=\{profileCanWrite\(session\.profile\)\}/);
  assert.match(leads, /readOnly=\{!canWrite\}/);
  assert.match(leads, /archived \|\| !canWrite \? null : \(/);
  assert.match(dashboard, /canWrite \? \(/);
  assert.match(settings, /saveSettings/);
  assert.match(settings, /canWrite \? \(/);
  assert.match(pipeline, /useCanWriteCrm/);
  assert.match(pipeline, /canDrag=\{canWrite\}/);
  assert.match(menu, /if \(!canWrite\) return null/);
});

test("SendPilot webhook apply path is unchanged by this foundation", () => {
  assert.equal(webhookApply.includes("canWriteCrm"), false);
  assert.equal(webhookApply.includes("requireWriter"), false);
  assert.equal(webhookRoute.includes("canWriteCrm"), false);
  assert.match(webhookApply, /createAdminClient|service role/i);
});
