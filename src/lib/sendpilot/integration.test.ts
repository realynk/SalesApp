import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractSendPilotIdentifiers, parseSendPilotEnvelope } from "./events.ts";
import {
  parseLegacySendPilotIntegration,
  planIdentityDualWrite,
  resolveWebhookCampaignId,
  webhookActivityIntegrationMetadata,
  workspaceMismatch,
} from "./integration.ts";
import { shouldCreateUnmatchedWebhookLead, webhookLeadUpdate } from "./webhook.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const applySource = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
const routeSource = readFileSync(join(root, "src/app/api/sendpilot/webhook/route.ts"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

test("legacy integration parser requires an id and preserves workspace_id", () => {
  assert.equal(parseLegacySendPilotIntegration(null), null);
  assert.deepEqual(
    parseLegacySendPilotIntegration({
      id: "int_main",
      name: "Realynk Main",
      workspace_id: " ws_real ",
      status: "active",
      tracking_mode: "all",
      legacy_env: true,
    }),
    {
      id: "int_main",
      name: "Realynk Main",
      workspaceId: "ws_real",
      status: "active",
      trackingMode: "all",
      legacyEnv: true,
    },
  );
});

test("workspace mismatch ignores only when both ids are present and differ", () => {
  assert.equal(workspaceMismatch(null, "ws_real"), false);
  assert.equal(workspaceMismatch("", "ws_real"), false);
  assert.equal(workspaceMismatch("ws_real", null), false);
  assert.equal(workspaceMismatch("ws_real", "ws_real"), false);
  assert.equal(workspaceMismatch(" ws_real ", "ws_real"), false);
  assert.equal(workspaceMismatch("ws_other", "ws_real"), true);
});

test("missing workspaceId on a documented Account 1 envelope continues (no mismatch)", () => {
  const envelope = parseSendPilotEnvelope({
    eventId: "evt_no_ws",
    eventType: "lead.tag.updated",
    data: { leadId: "lead_1", newTag: "Interested" },
  });
  assert.equal(envelope?.workspaceId, null);
  assert.equal(workspaceMismatch(envelope?.workspaceId, "ws_real"), false);
});

test("campaignId prefers verified payload then API enrichment and never invents an id", () => {
  assert.equal(resolveWebhookCampaignId("camp_payload", "camp_api"), "camp_payload");
  assert.equal(resolveWebhookCampaignId(null, "camp_api"), "camp_api");
  assert.equal(resolveWebhookCampaignId("  ", " camp_api "), "camp_api");
  assert.equal(resolveWebhookCampaignId(null, null), null);
  assert.equal(extractSendPilotIdentifiers({ leadId: "lead_1" }).campaignId, null);
  assert.equal(extractSendPilotIdentifiers({ leadId: "lead_1", campaignId: "camp_xyz" }).campaignId, "camp_xyz");
});

test("Account 1 with or without campaignId still uses existing Interested auto-create rules", () => {
  const withCampaign = shouldCreateUnmatchedWebhookLead({
    hasExistingLead: false,
    possibleDuplicate: false,
    suppressed: false,
    applyNormalized: true,
    normalized: "Interested",
    sendpilotLeadId: "sp_1",
    email: null,
    linkedinUrl: null,
  });
  const withoutCampaign = shouldCreateUnmatchedWebhookLead({
    hasExistingLead: false,
    possibleDuplicate: false,
    suppressed: false,
    applyNormalized: true,
    normalized: "Not Interested",
    sendpilotLeadId: "sp_2",
    email: null,
    linkedinUrl: null,
  });
  assert.equal(withCampaign, true);
  assert.equal(withoutCampaign, true);
  const patch = webhookLeadUpdate({
    existingSendpilotLeadId: "sp_1",
    incomingLeadId: "sp_1",
    status: { normalized: "Interested", raw: "Interested", applyNormalized: true },
    nowIso: "2026-10-07T12:00:00.000Z",
  });
  assert.equal(patch.sendpilot_status, "Interested");
  assert.equal("sendpilot_lead_id" in patch, false);
});

test("activity metadata adds integrationId and campaignId without replacing existing fields", () => {
  assert.deepEqual(
    webhookActivityIntegrationMetadata({
      integrationId: "int_main",
      campaignId: "camp_a",
      extra: { sendpilotLeadId: "sp_1", campaignId: "camp_a" },
    }),
    { integrationId: "int_main", campaignId: "camp_a", sendpilotLeadId: "sp_1" },
  );
  assert.deepEqual(
    webhookActivityIntegrationMetadata({ integrationId: "int_main", campaignId: null, extra: { sendpilotLeadId: "sp_1" } }),
    { integrationId: "int_main", campaignId: null, sendpilotLeadId: "sp_1" },
  );
});

test("identity dual-write inserts for a new matched or auto-created lead", () => {
  assert.deepEqual(
    planIdentityDualWrite({
      integrationId: "int_main",
      sendpilotLeadId: "sp_1",
      resolvedLeadId: "lead_a",
      campaignId: "camp_a",
      existing: null,
      nowIso: "2026-10-07T12:00:00.000Z",
    }),
    {
      action: "insert",
      row: {
        integration_id: "int_main",
        sendpilot_lead_id: "sp_1",
        lead_id: "lead_a",
        sendpilot_campaign_id: "camp_a",
        first_seen_at: "2026-10-07T12:00:00.000Z",
        last_seen_at: "2026-10-07T12:00:00.000Z",
      },
    },
  );
});

test("identity dual-write updates the same lead and does not duplicate on repeat", () => {
  const first = planIdentityDualWrite({
    integrationId: "int_main",
    sendpilotLeadId: "sp_1",
    resolvedLeadId: "lead_a",
    campaignId: "camp_a",
    existing: { leadId: "lead_a", campaignId: "camp_a" },
    nowIso: "2026-10-07T13:00:00.000Z",
  });
  assert.equal(first.action, "update");
  if (first.action === "update") {
    assert.equal(first.patch.lead_id, "lead_a");
    assert.equal(first.patch.sendpilot_campaign_id, "camp_a");
    assert.equal(first.patch.last_seen_at, "2026-10-07T13:00:00.000Z");
  }
  const missingCampaign = planIdentityDualWrite({
    integrationId: "int_main",
    sendpilotLeadId: "sp_1",
    resolvedLeadId: "lead_a",
    campaignId: null,
    existing: { leadId: "lead_a", campaignId: "camp_a" },
    nowIso: "2026-10-07T14:00:00.000Z",
  });
  assert.equal(missingCampaign.action, "update");
  if (missingCampaign.action === "update") assert.equal(missingCampaign.patch.sendpilot_campaign_id, "camp_a");
});

test("identity dual-write does not silently relink to a different SalesApp lead", () => {
  assert.deepEqual(
    planIdentityDualWrite({
      integrationId: "int_main",
      sendpilotLeadId: "sp_1",
      resolvedLeadId: "lead_b",
      campaignId: "camp_a",
      existing: { leadId: "lead_a", campaignId: "camp_a" },
      nowIso: "2026-10-07T12:00:00.000Z",
    }),
    { action: "conflict", existingLeadId: "lead_a", resolvedLeadId: "lead_b" },
  );
});

test("identity dual-write skips when the webhook did not resolve both ids", () => {
  assert.equal(
    planIdentityDualWrite({
      integrationId: "int_main",
      sendpilotLeadId: null,
      resolvedLeadId: "lead_a",
      campaignId: null,
      existing: null,
      nowIso: "2026-10-07T12:00:00.000Z",
    }).action,
    "skip",
  );
});

test("suppression matching is still global and not integration-scoped", () => {
  const start = applySource.indexOf("async function findActiveSuppression");
  const end = applySource.indexOf("async function findOrCreateCompany");
  const suppression = applySource.slice(start, end);
  assert.ok(suppression.includes("sendpilot_suppressions"));
  assert.equal(suppression.includes("integration_id"), false);
});

test("workspace mismatch is recorded on the webhook event and returns before matching or reconciliation", () => {
  const mismatchAt = applySource.indexOf('reason: "workspace_mismatch"');
  const matchAt = applySource.indexOf("const matched = await matchLead");
  assert.ok(mismatchAt > 0 && matchAt > mismatchAt);
  assert.match(applySource, /ignored: true, reason: "workspace_mismatch"/);
});

test("claiming a webhook event still uses event_id uniqueness and stamps integration_id", () => {
  assert.match(applySource, /integration_id: input.integrationId/);
  assert.match(applySource, /campaign_id: input.campaignId/);
  assert.match(applySource, /inserted.error.code !== "23505"/);
  assert.match(applySource, /loadLegacySendPilotIntegration/);
  assert.match(applySource, /legacy_integration_missing/);
  assert.match(applySource, /api_lookup_failed/);
  assert.match(applySource, /unsupported_event/);
});

test("matchLead does not use sendpilot_lead_identities and still prefers sendpilot_lead_id then external_id", () => {
  const start = applySource.indexOf("async function matchLead");
  const end = applySource.indexOf("async function findActiveSuppression");
  const matchLead = applySource.slice(start, end);
  assert.ok(matchLead.includes("leadBySendPilotId"));
  assert.ok(matchLead.includes("leadByExternalRecord"));
  assert.ok(matchLead.includes("classifyWebhookIdentityMatch"));
  assert.equal(matchLead.includes("sendpilot_lead_identities"), false);
});

test("Phase 2 keeps the legacy webhook URL, Svix-first verify, env secrets, and matching order", () => {
  assert.match(routeSource, /verifySendPilotSignature/);
  assert.match(routeSource, /sendpilotWebhookSecret\(\)/);
  assert.match(routeSource, /applySendPilotWebhook\(rawBody\)/);
  assert.equal(routeSource.includes("[integrationId]"), false);
  assert.match(applySource, /\.eq\("legacy_env", true\)/);
  assert.match(applySource, /leadBySendPilotId/);
  assert.match(applySource, /leadByExternalRecord/);
  assert.match(applySource, /\.eq\("sendpilot_lead_id", sendpilotLeadId\)/);
  assert.match(applySource, /classifyWebhookIdentityMatch/);
  assert.match(applySource, /shouldCreateUnmatchedWebhookLead/);
  assert.match(applySource, /shouldApplyCrm\(integration\)/);
  assert.match(applySource, /allowLegacyEnvFallback: integration.legacyEnv/);
  assert.match(envExample, /^SENDPILOT_WEBHOOK_SECRET=/m);
  assert.match(envExample, /^SENDPILOT_API_KEY=/m);
  assert.match(envExample, /^SENDPILOT_API_BASE_URL=/m);
  assert.match(envExample, /^SENDPILOT_SECRETS_ENCRYPTION_KEY=/m);
  assert.equal(/SENDPILOT_API_KEY_2|SENDPILOT_WEBHOOK_SECRET_2/.test(envExample), false);
  assert.equal(/NEXT_PUBLIC_SENDPILOT_SECRETS_ENCRYPTION_KEY/.test(envExample), false);
});
