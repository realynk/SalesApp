import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCredentialCiphertextRow } from "./credentials.ts";
import { encryptSecret } from "./secrets.ts";
import {
  ACTIVATION_API_KEY_MISSING,
  ACTIVATION_TRACKING_INVALID,
  ACTIVATION_WEBHOOK_SECRET_MISSING,
  apiAuthForCampaignSync,
  authorizeSendPilotMutation,
  credentialFlagsFromCiphertext,
  credentialStatus,
  credentialStatusLabel,
  DEFAULT_NEW_STATUS,
  fieldCredentialLabel,
  INTEGRATION_NOT_FOUND,
  LEGACY_MUTATION_DENIED,
  parseManagedIntegrationId,
  planActivation,
  planCampaignTrackingRows,
  planCreateAudits,
  planDisable,
  planNewIntegrationRow,
  planPartialCredentialUpdate,
  planRemove,
  planRotateCredentials,
  planSafeSaveResult,
  planTrackingModeChange,
  sanitizeAuditMetadata,
  statusHeadline,
  toSafeIntegrationView,
  webhookPathForIntegration,
  webhookUrlForIntegration,
} from "./manage.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const phase4Migration = readFileSync(join(root, "supabase/migrations/20261007210000_sendpilot_integration_management.sql"), "utf8");
const phase1Migration = readFileSync(join(root, "supabase/migrations/20261005120000_sendpilot_integrations.sql"), "utf8");
const phase3Migration = readFileSync(join(root, "supabase/migrations/20261007180000_sendpilot_credential_grants.sql"), "utf8");
const actionsSource = readFileSync(join(root, "src/server/sendpilot-integrations.ts"), "utf8");
const clientSource = readFileSync(join(root, "src/lib/sendpilot/client.ts"), "utf8");
const applySource = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
const eventsSource = readFileSync(join(root, "src/lib/sendpilot/events.ts"), "utf8");
const settingsPage = readFileSync(join(root, "src/app/(app)/settings/sendpilot/page.tsx"), "utf8");
const detailPage = readFileSync(join(root, "src/app/(app)/settings/sendpilot/[id]/page.tsx"), "utf8");
const wizardSource = readFileSync(join(root, "src/components/sendpilot-account-wizard.tsx"), "utf8");
const manageUi = readFileSync(join(root, "src/components/sendpilot-integration-manage.tsx"), "utf8");
const phase51Migration = readFileSync(join(root, "supabase/migrations/20261007230000_sendpilot_credential_status.sql"), "utf8");
const KEY = "e".repeat(64);
const DRAFT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function readyActivation(overrides: Partial<Parameters<typeof planActivation>[0]> = {}) {
  return planActivation({
    legacyEnv: false,
    status: "draft",
    apiKeyConfigured: true,
    webhookSecretConfigured: true,
    trackingMode: "all",
    selectedCampaignIds: [],
    integrationId: DRAFT_ID,
    ...overrides,
  });
}

test("A. sales_lead can access integration management", () => {
  assert.deepEqual(authorizeSendPilotMutation("sales_lead"), { ok: true });
  assert.match(settingsPage, /Add SendPilot Account/);
  assert.match(actionsSource, /authorizeSendPilotMutation/);
});

test("B/S. non-admin cannot mutate integrations including direct action calls", () => {
  assert.equal(authorizeSendPilotMutation("recruiter").ok, false);
  assert.equal(authorizeSendPilotMutation("member").ok, false);
  assert.equal(authorizeSendPilotMutation(null).ok, false);
  assert.match(actionsSource, /if \(!auth\.ok\) return \{ error: auth\.error \}/);
  assert.equal((actionsSource.match(/authorizeSendPilotMutation/g) ?? []).length >= 1, true);
  assert.match(actionsSource, /async function requireAdmin/);
  assert.equal(actionsSource.includes("profile?.role") || actionsSource.includes("session.profile"), true);
});

test("C. Realynk Main appears as legacy production", () => {
  const view = toSafeIntegrationView({
    id: "legacy-id",
    name: "Realynk Main",
    workspaceId: "ws_main",
    status: "active",
    trackingMode: "all",
    legacyEnv: true,
    credentialsPresent: false,
    lastWebhookAt: "2026-10-05T00:00:00.000Z",
    lastCampaignSyncAt: null,
    createdAt: "2026-10-05T00:00:00.000Z",
    campaignCount: 4,
    trackedCount: 4,
  });
  assert.equal(view.credentialStatus, "legacy_environment");
  assert.equal(credentialStatusLabel(view.credentialStatus), "Legacy environment");
  assert.match(statusHeadline(view), /Legacy Production/);
  assert.equal(webhookPathForIntegration(view), "/api/sendpilot/webhook");
  assert.match(settingsPage, /legacyEnv/);
  assert.match(detailPage, /Webhook connected/i);
});

test("D. Realynk Main cannot be hard deleted", () => {
  const denied = planRemove({ legacyEnv: true, nowIso: "2026-10-07T00:00:00.000Z" });
  assert.equal("error" in denied, true);
  if ("error" in denied) assert.equal(denied.error, LEGACY_MUTATION_DENIED);
  const soft = planRemove({ legacyEnv: false, nowIso: "2026-10-07T00:00:00.000Z" });
  assert.equal("error" in soft, false);
  if (!("error" in soft)) {
    assert.equal(soft.hardDelete, false);
    assert.equal(soft.patch.status, "removed");
  }
  assert.match(phase4Migration, /No DELETE policies/);
});

test("E. Realynk Main env credentials are not exposed", () => {
  const view = toSafeIntegrationView({
    id: "legacy-id",
    name: "Realynk Main",
    workspaceId: null,
    status: "active",
    trackingMode: "all",
    legacyEnv: true,
    credentialsPresent: false,
    lastWebhookAt: null,
    lastCampaignSyncAt: null,
    createdAt: null,
    campaignCount: 0,
    trackedCount: 0,
  });
  const json = JSON.stringify(view);
  assert.equal(json.includes("SENDPILOT_API_KEY"), false);
  assert.equal(json.includes("whsec_"), false);
  assert.equal(view.credentialStatus, "legacy_environment");
  assert.equal("apiKey" in view, false);
});

test("F. new integration defaults to draft and is not activated", () => {
  const planned = planNewIntegrationRow({ name: "Account Two", actorId: "user-1", trackingMode: "all" });
  assert.equal("error" in planned, false);
  if (!("error" in planned)) {
    assert.equal(planned.row.status, DEFAULT_NEW_STATUS);
    assert.equal(planned.row.status, "draft");
    assert.equal(planned.row.legacy_env, false);
    assert.equal(planned.row.workspace_id, null);
    assert.equal(planned.row.credentials_present, false);
    assert.equal(planned.row.webhook_secret_configured, false);
  }
  const afterCredentials = readyActivation({ status: "draft" });
  assert.equal("error" in afterCredentials, false);
  if (!("error" in afterCredentials)) assert.equal(afterCredentials.patch.status, "active");
});

test("G/H. plaintext API key and webhook secret are encrypted before storage", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    const row = buildCredentialCiphertextRow({
      integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      apiKey: "sp_plain_api",
      webhookSecret: "whsec_plain_secret",
      nowIso: "2026-10-07T00:00:00.000Z",
    });
    assert.equal(row.api_key_ciphertext?.includes("sp_plain_api"), false);
    assert.equal(row.webhook_secret_ciphertext?.includes("whsec_plain_secret"), false);
    assert.match(row.api_key_ciphertext ?? "", /^v1\./);
    assert.match(row.webhook_secret_ciphertext ?? "", /^v1\./);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("I/Q. credentials never returned from save/read responses or rotation", () => {
  const result = planSafeSaveResult({
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    name: "Future",
    trackingMode: "all",
    webhookUrl: "/api/sendpilot/webhook/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    apiKeyConfigured: true,
    webhookSecretConfigured: false,
  });
  const json = JSON.stringify(result);
  assert.equal(json.includes("api_key"), false);
  assert.equal(json.includes("ciphertext"), false);
  assert.equal(json.includes("whsec_"), false);
  assert.match(json, /"webhookSecretStatus":"Missing"/);
  assert.match(json, /"status":"draft"/);
  assert.equal(planRotateCredentials({ legacyEnv: true }).error, LEGACY_MUTATION_DENIED);
  assert.deepEqual(planRotateCredentials({ legacyEnv: false }), { ok: true });
});

test("J. non-legacy cannot fall back to SENDPILOT_API_KEY", () => {
  const previous = process.env.SENDPILOT_API_KEY;
  process.env.SENDPILOT_API_KEY = "legacy_env_key";
  try {
    const blocked = apiAuthForCampaignSync({ legacyEnv: false, integrationApiKey: null });
    assert.equal("error" in blocked, true);
    const allowed = apiAuthForCampaignSync({ legacyEnv: false, integrationApiKey: "account_2_key" });
    assert.equal("error" in allowed, false);
    if (!("error" in allowed)) assert.equal(allowed.apiKey, "account_2_key");
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_API_KEY;
    else process.env.SENDPILOT_API_KEY = previous;
  }
});

test("K. campaign sync would use the integration credential, not the env key", () => {
  const previous = process.env.SENDPILOT_API_KEY;
  process.env.SENDPILOT_API_KEY = "legacy_env_key";
  try {
    const auth = apiAuthForCampaignSync({ legacyEnv: false, integrationApiKey: "integration_b_key" });
    assert.equal("apiKey" in auth && auth.apiKey === "integration_b_key", true);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_API_KEY;
    else process.env.SENDPILOT_API_KEY = previous;
  }
});

test("L/M/N. campaign selections persist, selected requires one, all does not", () => {
  const selectedEmpty = planTrackingModeChange({ legacyEnv: false, mode: "selected", selectedCampaignIds: [] });
  assert.equal("error" in selectedEmpty, true);
  const allOk = planTrackingModeChange({ legacyEnv: false, mode: "all", selectedCampaignIds: [] });
  assert.equal("error" in allOk, false);
  const tracking = planCampaignTrackingRows({
    integrationId: "int-1",
    mode: "selected",
    selectedCampaignIds: ["camp_a"],
    existing: [
      { sendpilotCampaignId: "camp_a", tracked: true },
      { sendpilotCampaignId: "camp_b", tracked: true },
    ],
    nowIso: "2026-10-07T00:00:00.000Z",
  });
  assert.equal("error" in tracking, false);
  if (!("error" in tracking)) {
    assert.equal(tracking.deleteExisting, false);
    const byId = Object.fromEntries(tracking.upserts.map((row) => [row.sendpilot_campaign_id, row]));
    assert.equal(byId.camp_a.tracked, true);
    assert.equal(byId.camp_b.tracked, false);
    assert.equal(byId.camp_b.untracked_at, "2026-10-07T00:00:00.000Z");
  }
});

test("O. disable preserves configuration", () => {
  const planned = planDisable({ legacyEnv: false, status: "draft", nowIso: "2026-10-07T00:00:00.000Z" });
  assert.equal("error" in planned, false);
  if (!("error" in planned)) {
    assert.equal(planned.patch.status, "disabled");
    assert.equal("credentials" in planned.patch, false);
  }
  assert.equal("error" in planDisable({ legacyEnv: true, status: "active", nowIso: "2026-10-07T00:00:00.000Z" }), true);
});

test("P. remove is soft-state only", () => {
  const planned = planRemove({ legacyEnv: false, nowIso: "2026-10-07T00:00:00.000Z" });
  if (!("error" in planned)) {
    assert.equal(planned.hardDelete, false);
    assert.equal(planned.patch.status, "removed");
  }
});

test("R. audit rows contain no secrets", () => {
  const audits = planCreateAudits({ trackingMode: "all", selectedCount: 0 });
  const dirty = sanitizeAuditMetadata({
    api_key: "sp_live",
    webhook_secret: "whsec_secret",
    ciphertext: encryptable(),
    nested: { SENDPILOT_SECRETS_ENCRYPTION_KEY: "abc" },
  });
  const json = JSON.stringify({ audits, dirty });
  assert.equal(json.includes("sp_live"), false);
  assert.equal(json.includes("whsec_secret"), false);
  assert.match(json, /\[redacted\]/);
  assert.equal(audits.some((row) => row.action === "integration_created"), true);
  assert.equal(audits.some((row) => row.action === "credentials_saved"), true);
});

test("T/U/V. Phase 1–3 webhook behavior files remain and CRM apply is safety-gated", () => {
  assert.match(applySource, /crm_apply_not_enabled/);
  assert.match(applySource, /crmApplySafetyGate/);
  assert.equal(/drop table/i.test(phase4Migration), false);
  assert.equal(phase1Migration.includes("create table public.sendpilot_integrations"), true);
  assert.equal(phase3Migration.includes("sendpilot_upsert_integration_credentials"), true);
  assert.equal(clientSource.includes("/campaigns"), false);
});

test("Phase 4 RLS is additive and admin-only for mutations", () => {
  assert.match(phase4Migration, /drop policy if exists sendpilot_integrations_insert/);
  assert.match(phase4Migration, /private\.is_sendpilot_admin\(\)/);
  assert.match(phase4Migration, /credentials_present/);
  assert.match(phase4Migration, /last_campaign_sync_at/);
  assert.equal(/grant execute[^\n]+authenticated/.test(phase4Migration), false);
  assert.match(phase4Migration, /revoke all on table private\.sendpilot_integration_credentials/);
});

test("webhook URLs keep Realynk Main on the legacy path", () => {
  assert.equal(
    webhookUrlForIntegration({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", legacyEnv: true, baseUrl: "https://example.com" }),
    "https://example.com/api/sendpilot/webhook",
  );
  assert.equal(
    webhookUrlForIntegration({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", legacyEnv: false, baseUrl: "https://example.com" }),
    "https://example.com/api/sendpilot/webhook/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  );
});

test("credential status mapping", () => {
  assert.equal(credentialStatus({ legacyEnv: true, credentialsPresent: true }), "legacy_environment");
  assert.equal(credentialStatus({ legacyEnv: false, credentialsPresent: true }), "configured");
  assert.equal(credentialStatus({ legacyEnv: false, credentialsPresent: false }), "not_configured");
  assert.equal(fieldCredentialLabel({ legacyEnv: true, configured: false }), "Legacy environment");
  assert.equal(fieldCredentialLabel({ legacyEnv: false, configured: true }), "Configured");
  assert.equal(fieldCredentialLabel({ legacyEnv: false, configured: false }), "Missing");
});

test("A. new integration can be created as draft without webhook secret", () => {
  const planned = planNewIntegrationRow({ name: "Draft account", actorId: "user-1", trackingMode: "all" });
  assert.equal("error" in planned, false);
  if (!("error" in planned)) {
    assert.equal(planned.row.webhook_secret_configured, false);
    assert.equal(planned.row.status, "draft");
  }
  assert.equal(wizardSource.includes("webhook_secret"), false);
  assert.equal(wizardSource.includes("SendPilot webhook signing secret"), false);
  assert.match(actionsSource, /if \(!apiKey\.trim\(\)\) return \{ error: "Enter a SendPilot API key\." \}/);
  assert.equal(actionsSource.includes("Enter the API key and webhook signing secret."), false);
});

test("B/C. draft UUID exists before webhook setup and dynamic URL uses it", () => {
  assert.equal(
    webhookUrlForIntegration({ id: DRAFT_ID, legacyEnv: false, baseUrl: "https://sales.example.test" }),
    `https://sales.example.test/api/sendpilot/webhook/${DRAFT_ID}`,
  );
  assert.match(actionsSource, /redirect\(`\/settings\/sendpilot\/\$\{integrationId\}`\)/);
  assert.match(detailPage, /CopyWebhookUrl/);
});

test("D/E. API key is stored encrypted and webhook secret can be added later", () => {
  assert.match(actionsSource, /upsertEncryptedCredentials\(integrationId, \{ apiKey: apiKey\.trim\(\) \}\)/);
  assert.match(actionsSource, /export async function saveSendPilotWebhookSecret/);
  assert.match(manageUi, /Webhook Signing Secret/);
});

test("F/G. partial credential updates preserve the other ciphertext", () => {
  const existing = {
    api_key_ciphertext: "v1.keep-api",
    webhook_secret_ciphertext: "v1.keep-webhook",
  };
  const webhookOnly = planPartialCredentialUpdate({
    existing,
    webhookSecret: "whsec_new",
  });
  assert.equal(webhookOnly.preservesApiKey, true);
  assert.equal(webhookOnly.nextApi, "existing");
  assert.equal(webhookOnly.nextWebhook, "incoming");
  const apiOnly = planPartialCredentialUpdate({
    existing,
    apiKey: "sp_new",
  });
  assert.equal(apiOnly.preservesWebhookSecret, true);
  assert.equal(apiOnly.nextWebhook, "existing");
  assert.equal(apiOnly.nextApi, "incoming");
});

test("H. credential values and ciphertext never return to browser UI", () => {
  assert.equal(manageUi.includes("ciphertext"), false);
  assert.equal(detailPage.includes("whsec_"), false);
  assert.equal(wizardSource.includes("ciphertext"), false);
  assert.match(manageUi, /Webhook secret: Configured/);
});

test("I. new integration remains draft after credentials are configured", () => {
  const view = toSafeIntegrationView({
    id: DRAFT_ID,
    name: "Draft",
    workspaceId: null,
    status: "draft",
    trackingMode: "all",
    legacyEnv: false,
    credentialsPresent: true,
    apiKeyConfigured: true,
    webhookSecretConfigured: true,
    lastWebhookAt: null,
    lastCampaignSyncAt: null,
    createdAt: null,
    campaignCount: 0,
    trackedCount: 0,
  });
  assert.equal(view.status, "draft");
  assert.equal(view.crmSyncEnabled, false);
});

test("J/K/L. activation is denied when readiness is incomplete", () => {
  const missingKey = readyActivation({ apiKeyConfigured: false });
  const missingSecret = readyActivation({ webhookSecretConfigured: false });
  const badTracking = readyActivation({ trackingMode: "selected", selectedCampaignIds: [] });
  assert.equal("error" in missingKey && missingKey.error, ACTIVATION_API_KEY_MISSING);
  assert.equal("error" in missingSecret && missingSecret.error, ACTIVATION_WEBHOOK_SECRET_MISSING);
  assert.equal("error" in badTracking && badTracking.error, ACTIVATION_TRACKING_INVALID);
});

test("M. activation succeeds only when readiness requirements pass", () => {
  const planned = readyActivation();
  assert.equal("error" in planned, false);
  if (!("error" in planned)) assert.equal(planned.patch.status, "active");
  assert.match(actionsSource, /action: "integration_activated"/);
  assert.match(manageUi, /Activate Integration/);
});

test("N. sales_lead authorization required for mutations", () => {
  assert.equal(authorizeSendPilotMutation("sales_lead").ok, true);
  assert.equal(authorizeSendPilotMutation("recruiter").ok, false);
  assert.match(actionsSource, /saveSendPilotWebhookSecret/);
  assert.match(actionsSource, /if \(!auth\.ok\) return \{ error: auth\.error \}/);
});

test("O/P. Realynk Main cannot be mutated through non-legacy controls", () => {
  const legacyActivate = readyActivation({ legacyEnv: true, status: "active" });
  assert.equal("error" in legacyActivate && legacyActivate.error, LEGACY_MUTATION_DENIED);
  assert.equal("error" in planDisable({ legacyEnv: true, status: "active", nowIso: "2026-10-07T00:00:00.000Z" }), true);
  assert.equal("error" in planRemove({ legacyEnv: true, nowIso: "2026-10-07T00:00:00.000Z" }), true);
  assert.equal(planRotateCredentials({ legacyEnv: true }).error, LEGACY_MUTATION_DENIED);
  assert.equal(webhookPathForIntegration({ id: DRAFT_ID, legacyEnv: true }), "/api/sendpilot/webhook");
  assert.match(detailPage, /existing Realynk Main webhook/);
});

test("Q. no campaign-list endpoint is invented", () => {
  assert.equal(clientSource.includes("/campaigns"), false);
  assert.match(manageUi, /CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE/);
});

test("Phase 5.1 migration is additive and does not expose secrets", () => {
  assert.match(phase51Migration, /api_key_configured/);
  assert.match(phase51Migration, /webhook_secret_configured/);
  assert.equal(/drop table/i.test(phase51Migration), false);
  assert.equal(/delete from/i.test(phase51Migration), false);
  assert.match(phase51Migration, /legacy_env = false/);
  assert.match(eventsSource, /lead\.tag\.updated/);
  assert.match(eventsSource, /lead\.updated/);
  assert.match(eventsSource, /reply\.received/);
  assert.match(manageUi, /SUPPORTED_SENDPILOT_EVENTS/);
});

test("webhook secret form submits integration_id to saveSendPilotWebhookSecret", () => {
  const start = manageUi.indexOf("ActionForm action={saveSendPilotWebhookSecret}");
  const webhookForm = manageUi.slice(start, start + 900);
  assert.ok(start >= 0);
  assert.match(webhookForm, /name="integration_id"/);
  assert.match(webhookForm, /value=\{detail.id\}/);
  assert.match(actionsSource, /export async function saveSendPilotWebhookSecret/);
  assert.match(actionsSource, /text\(formData, "integration_id"\)/);
  assert.match(actionsSource, /parseManagedIntegrationId/);
});

test("missing or invalid integration_id fails before any UUID database filter", () => {
  assert.deepEqual(parseManagedIntegrationId(""), { error: INTEGRATION_NOT_FOUND });
  assert.deepEqual(parseManagedIntegrationId("   "), { error: INTEGRATION_NOT_FOUND });
  assert.deepEqual(parseManagedIntegrationId("not-a-uuid"), { error: INTEGRATION_NOT_FOUND });
  assert.deepEqual(parseManagedIntegrationId(DRAFT_ID), { id: DRAFT_ID });
  const loader = actionsSource.slice(
    actionsSource.indexOf("async function loadIntegrationRow"),
    actionsSource.indexOf("async function writeAudits"),
  );
  const parseAt = loader.indexOf("parseManagedIntegrationId");
  const queryAt = loader.indexOf('.eq("id"');
  assert.ok(parseAt >= 0 && queryAt > parseAt);
  assert.match(loader, /if \("error" in parsed\) return \{ error: parsed.error \}/);
});

test("credential flags follow ciphertext presence", () => {
  assert.deepEqual(
    credentialFlagsFromCiphertext({ api_key_ciphertext: "v1.a", webhook_secret_ciphertext: null }),
    { api_key_configured: true, webhook_secret_configured: false, credentials_present: false },
  );
  assert.deepEqual(
    credentialFlagsFromCiphertext({ api_key_ciphertext: "v1.a", webhook_secret_ciphertext: "v1.b" }),
    { api_key_configured: true, webhook_secret_configured: true, credentials_present: true },
  );
});

function encryptable() {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    return encryptSecret("hidden");
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
}
