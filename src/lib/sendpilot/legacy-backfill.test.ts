import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalizeSendPilotEventType,
  extractSendPilotIdentifiers,
  parseSendPilotEnvelope,
} from "./events.ts";
import {
  campaignIdFromEnvelopeData,
  identitiesAllowSameLeadIdAcrossIntegrations,
  LEGACY_INTEGRATION_NAME,
  planLegacyIdentityBackfill,
  resolveLegacyWorkspaceId,
  uniqueCampaignIdForLead,
} from "./legacy-backfill.ts";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/20261005120000_sendpilot_integrations.sql",
);
const webhookRoutePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../app/api/sendpilot/webhook/route.ts",
);
const envExamplePath = join(dirname(fileURLToPath(import.meta.url)), "../../../.env.example");

const migration = readFileSync(migrationPath, "utf8");
const webhookRoute = readFileSync(webhookRoutePath, "utf8");
const envExample = readFileSync(envExamplePath, "utf8");

test("Phase 1 migration is additive and does not drop live uniqueness or webhook idempotency", () => {
  assert.equal(/drop table/i.test(migration), false);
  assert.equal(/drop index/i.test(migration), false);
  assert.equal(/leads_sendpilot_lead_id_unique/.test(migration), false);
  assert.equal(/alter table public\.leads\s+drop/i.test(migration), false);
  assert.equal(/alter table public\.sendpilot_webhook_events[\s\S]*drop constraint/i.test(migration), false);
  assert.equal(/primary key\s*\(\s*integration_id\s*,\s*event_id\s*\)/i.test(migration), false);
  assert.match(migration, /add column if not exists integration_id/);
  assert.match(migration, /add column if not exists campaign_id/);
});

test("Phase 1 creates integration, campaign, identity, audit, and private credential tables", () => {
  assert.match(migration, /create table public\.sendpilot_integrations/);
  assert.match(migration, /create table public\.sendpilot_campaigns/);
  assert.match(migration, /create table public\.sendpilot_campaign_tracking/);
  assert.match(migration, /create table public\.sendpilot_lead_identities/);
  assert.match(migration, /create table public\.sendpilot_integration_audit/);
  assert.match(migration, /create table private\.sendpilot_integration_credentials/);
  assert.match(migration, /unique \(integration_id, sendpilot_lead_id\)/);
  assert.match(migration, /unique \(integration_id, sendpilot_campaign_id\)/);
  assert.match(migration, /legacy_env boolean not null default false/);
  assert.match(migration, /'all'/);
  assert.match(migration, /'selected'/);
});

test("credential table is private, forced RLS, and revoked from client roles", () => {
  assert.match(migration, /create table private\.sendpilot_integration_credentials/);
  assert.match(migration, /alter table private\.sendpilot_integration_credentials enable row level security/);
  assert.match(migration, /alter table private\.sendpilot_integration_credentials force row level security/);
  assert.match(
    migration,
    /revoke all on table private\.sendpilot_integration_credentials from public, anon, authenticated/,
  );
  assert.equal(/grant (select|insert|update|all) on table private\.sendpilot_integration_credentials/i.test(migration), false);
  assert.match(migration, /api_key_ciphertext/);
  assert.match(migration, /webhook_secret_ciphertext/);
  assert.equal(/\bapi_key\b/.test(migration), false);
  assert.equal(/\bwebhook_secret\b/.test(migration), false);
});

test("legacy Account 1 backfill targets Realynk Main as active all-campaign env-backed integration", () => {
  assert.equal(LEGACY_INTEGRATION_NAME, "Realynk Main");
  assert.match(migration, /'Realynk Main'/);
  assert.match(migration, /legacy_env/);
  assert.match(migration, /tracking_mode/);
  assert.match(migration, /private\.backfill_legacy_sendpilot_integration/);
  assert.match(migration, /select private\.backfill_legacy_sendpilot_integration\(\)/);
  assert.equal(/SENDPILOT_WEBHOOK_SECRET/.test(migration), false);
  assert.equal(/SENDPILOT_API_KEY/.test(migration), false);
});

test("workspace_id is recovered only when exactly one distinct payload workspaceId exists", () => {
  assert.equal(resolveLegacyWorkspaceId([]), null);
  assert.equal(resolveLegacyWorkspaceId([null, "", "  "]), null);
  assert.equal(resolveLegacyWorkspaceId(["ws_main", "ws_main", " ws_main "]), "ws_main");
  assert.equal(resolveLegacyWorkspaceId(["ws_main", "ws_other"]), null);
  assert.match(migration, /payload ->> 'workspaceId'/);
  assert.match(migration, /count\(\*\) from ids\) = 1/);
});

test("campaign IDs are taken from payload data.campaignId and conflicts stay unassigned", () => {
  assert.equal(campaignIdFromEnvelopeData({ campaignId: "camp_a" }), "camp_a");
  assert.equal(campaignIdFromEnvelopeData({ campaign_id: "camp_a" }), null);
  assert.equal(campaignIdFromEnvelopeData({ campaignId: "  " }), null);
  assert.equal(uniqueCampaignIdForLead([{ campaignId: "camp_a" }, { campaignId: "camp_a" }]), "camp_a");
  assert.equal(uniqueCampaignIdForLead([{ campaignId: "camp_a" }, { campaignId: "camp_b" }]), null);
  assert.equal(uniqueCampaignIdForLead([{ campaignId: null }, { campaignId: "" }]), null);
  const envelope = parseSendPilotEnvelope({
    eventId: "evt_hist",
    eventType: "lead.updated",
    workspaceId: "ws_main",
    data: { leadId: "lead_1", campaignId: "camp_xyz789" },
  });
  assert.equal(envelope?.workspaceId, "ws_main");
  assert.equal(extractSendPilotIdentifiers(envelope?.data ?? {}).campaignId, "camp_xyz789");
});

test("identity backfill is idempotent, skips null SendPilot ids, and does not invent rows", () => {
  const leads = [
    { id: "lead-row-1", sendpilotLeadId: "sp_1" },
    { id: "lead-row-2", sendpilotLeadId: "sp_2" },
    { id: "lead-row-3", sendpilotLeadId: null },
    { id: "lead-row-4", sendpilotLeadId: "  " },
  ];
  const first = planLegacyIdentityBackfill({
    integrationId: "int_main",
    leads,
    existing: [],
    campaignByLeadId: { sp_1: "camp_a" },
  });
  assert.deepEqual(
    first.map((row) => row.sendpilotLeadId),
    ["sp_1", "sp_2"],
  );
  assert.equal(first[0]?.campaignId, "camp_a");
  assert.equal(first[1]?.campaignId, null);

  const second = planLegacyIdentityBackfill({
    integrationId: "int_main",
    leads,
    existing: first.map((row) => ({ integrationId: row.integrationId, sendpilotLeadId: row.sendpilotLeadId })),
    campaignByLeadId: { sp_1: "camp_a" },
  });
  assert.deepEqual(second, []);
});

test("the same SendPilot lead id can exist on two integrations without identity conflict", () => {
  assert.equal(
    identitiesAllowSameLeadIdAcrossIntegrations([
      { integrationId: "int_a", sendpilotLeadId: "lead_shared" },
      { integrationId: "int_b", sendpilotLeadId: "lead_shared" },
    ]),
    true,
  );
  assert.equal(
    identitiesAllowSameLeadIdAcrossIntegrations([
      { integrationId: "int_a", sendpilotLeadId: "lead_shared" },
      { integrationId: "int_a", sendpilotLeadId: "lead_shared" },
    ]),
    false,
  );
});

test("existing webhook route and env var names are unchanged", () => {
  assert.match(webhookRoute, /sendpilotWebhookSecret\(\)/);
  assert.match(webhookRoute, /applySendPilotWebhook\(rawBody\)/);
  assert.equal(webhookRoute.includes("[integrationId]"), false);
  assert.match(envExample, /^SENDPILOT_API_BASE_URL=/m);
  assert.match(envExample, /^SENDPILOT_API_KEY=/m);
  assert.match(envExample, /^SENDPILOT_WEBHOOK_SECRET=/m);
  assert.equal(/SENDPILOT_API_KEY_2|SENDPILOT_WEBHOOK_SECRET_2|SENDPILOT_ALLOWED_CAMPAIGN/.test(envExample), false);
  assert.equal(canonicalizeSendPilotEventType("lead.tag.updated"), "lead.tag.updated");
});
