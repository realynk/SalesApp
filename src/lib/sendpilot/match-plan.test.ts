import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { planIdentityDualWrite } from "./integration.ts";
import {
  globalSendpilotLeadIdPatch,
  IDENTITY_CONFLICT,
  planWebhookMatch,
  POSSIBLE_SAME_PERSON,
  suppressionAppliesToIntegration,
} from "./match-plan.ts";
import { crmApplySafetyGate } from "./policy.ts";
import { shouldCreateUnmatchedWebhookLead, webhookLeadUpdate } from "./webhook.ts";

const INT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INT_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const LEAD_A = "11111111-2222-4333-8444-555555555555";
const CONTACT_A = "contact-a";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const applySource = readFileSync(join(root, "src/lib/sendpilot/apply.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20261007220000_sendpilot_cross_workspace_matching.sql"), "utf8");
const reviewSource = readFileSync(join(root, "src/components/reconciliation-review.tsx"), "utf8");

const emptyLists = {
  linkedinContacts: [] as { id: string; company_id: string }[],
  emailContacts: [] as { id: string; company_id: string }[],
  leadByContactId: {},
  identitiesByLeadId: {},
};

test("A. Realynk Main scoped identity match works", () => {
  const decision = planWebhookMatch({
    integrationId: INT_A,
    legacyEnv: true,
    sendpilotLeadId: "sp_1",
    scopedIdentityLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" },
    legacyGlobalLead: null,
    scopedExternalLead: null,
    ...emptyLists,
  });
  assert.equal(decision.kind, "existing");
  if (decision.kind === "existing") assert.equal(decision.source, "scoped_identity");
});

test("B. Realynk Main legacy leads.sendpilot_lead_id fallback still works", () => {
  const decision = planWebhookMatch({
    integrationId: INT_A,
    legacyEnv: true,
    sendpilotLeadId: "sp_1",
    scopedIdentityLead: null,
    legacyGlobalLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" },
    scopedExternalLead: null,
    ...emptyLists,
  });
  assert.equal(decision.kind, "existing");
  if (decision.kind === "existing") assert.equal(decision.source, "legacy_global_id");
});

test("C. Non-legacy same SendPilot lead id as another integration does NOT cross-match", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_1",
    scopedIdentityLead: null,
    legacyGlobalLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" },
    scopedExternalLead: null,
    foreignExternalLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" },
    ...emptyLists,
  });
  assert.equal(decision.kind, "unmatched");
});

test("D. Non-legacy scoped identity matches correct lead", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_b" },
    legacyGlobalLead: { leadId: "other", contactId: "c-other", sendpilotLeadId: "sp_b" },
    scopedExternalLead: null,
    ...emptyLists,
  });
  assert.equal(decision.kind, "existing");
  if (decision.kind === "existing") {
    assert.equal(decision.source, "scoped_identity");
    assert.equal(decision.leadId, LEAD_A);
  }
});

test("E. Unique email match with NO existing SendPilot identity may auto-match", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [{ id: CONTACT_A, company_id: "co" }],
    linkedinContacts: [],
    leadByContactId: { [CONTACT_A]: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: null } },
    identitiesByLeadId: {},
  });
  assert.equal(decision.kind, "existing");
  if (decision.kind === "existing") assert.equal(decision.source, "email");
});

test("F. Unique LinkedIn match with NO existing SendPilot identity may auto-match", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [],
    linkedinContacts: [{ id: CONTACT_A, company_id: "co" }],
    leadByContactId: { [CONTACT_A]: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: null } },
    identitiesByLeadId: {},
  });
  assert.equal(decision.kind, "existing");
  if (decision.kind === "existing") assert.equal(decision.source, "linkedin");
});

test("G. Email match to lead with another integration identity → possible_same_person", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    campaignId: "camp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [{ id: CONTACT_A, company_id: "co" }],
    linkedinContacts: [],
    leadByContactId: { [CONTACT_A]: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" } },
    identitiesByLeadId: {
      [LEAD_A]: [{ integrationId: INT_A, sendpilotLeadId: "sp_1", leadId: LEAD_A }],
    },
  });
  assert.equal(decision.kind, POSSIBLE_SAME_PERSON);
  if (decision.kind === POSSIBLE_SAME_PERSON) {
    assert.deepEqual(decision.evidence.existingIntegrationIds, [INT_A]);
    assert.deepEqual(decision.evidence.matchedOn, ["email"]);
    assert.equal(JSON.stringify(decision.evidence).includes("whsec_"), false);
  }
});

test("H. LinkedIn match to lead with another integration identity → possible_same_person", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [],
    linkedinContacts: [{ id: CONTACT_A, company_id: "co" }],
    leadByContactId: { [CONTACT_A]: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_1" } },
    identitiesByLeadId: {
      [LEAD_A]: [{ integrationId: INT_A, sendpilotLeadId: "sp_1", leadId: LEAD_A }],
    },
  });
  assert.equal(decision.kind, POSSIBLE_SAME_PERSON);
  if (decision.kind === POSSIBLE_SAME_PERSON) assert.deepEqual(decision.evidence.matchedOn, ["linkedin"]);
});

test("I. Same integration + same SendPilot identity → normal match", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_b" },
    legacyGlobalLead: null,
    scopedExternalLead: null,
    ...emptyLists,
  });
  assert.equal(decision.kind, "existing");
});

test("J. Same integration + conflicting SendPilot identity → review", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_new",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [{ id: CONTACT_A, company_id: "co" }],
    linkedinContacts: [],
    leadByContactId: { [CONTACT_A]: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_old" } },
    identitiesByLeadId: {
      [LEAD_A]: [{ integrationId: INT_B, sendpilotLeadId: "sp_old", leadId: LEAD_A }],
    },
  });
  assert.equal(decision.kind, IDENTITY_CONFLICT);
});

test("K/L. Multiple email or LinkedIn candidates stay possible_duplicate", () => {
  const email = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [
      { id: "c1", company_id: "co" },
      { id: "c2", company_id: "co" },
    ],
    linkedinContacts: [],
    leadByContactId: {},
    identitiesByLeadId: {},
  });
  const linkedin = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_b",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    emailContacts: [],
    linkedinContacts: [
      { id: "c1", company_id: "co" },
      { id: "c2", company_id: "co" },
    ],
    leadByContactId: {},
    identitiesByLeadId: {},
  });
  assert.equal(email.kind, "possible_duplicate");
  assert.equal(linkedin.kind, "possible_duplicate");
});

test("M. Identity conflict never overwrites lead_id", () => {
  const conflict = planIdentityDualWrite({
    integrationId: INT_B,
    sendpilotLeadId: "sp_b",
    resolvedLeadId: LEAD_A,
    campaignId: null,
    existing: { leadId: "other-lead", campaignId: null },
    nowIso: "2026-10-07T00:00:00.000Z",
  });
  assert.equal(conflict.action, "conflict");
});

test("N/O/P. Auto-create remains Interested/Not Interested only", () => {
  const base = {
    hasExistingLead: false,
    possibleDuplicate: false,
    suppressed: false,
    applyNormalized: true,
    sendpilotLeadId: "sp_b",
    email: null,
    linkedinUrl: null,
  };
  assert.equal(shouldCreateUnmatchedWebhookLead({ ...base, normalized: "Interested" }), true);
  assert.equal(shouldCreateUnmatchedWebhookLead({ ...base, normalized: "Not Interested" }), true);
  assert.equal(shouldCreateUnmatchedWebhookLead({ ...base, normalized: "No Response" }), false);
});

test("Q. Non-legacy lead does not write unsafe global leads.sendpilot_lead_id", () => {
  assert.equal(globalSendpilotLeadIdPatch({ legacyEnv: false, existing: null, incoming: "sp_b" }), null);
  assert.equal(globalSendpilotLeadIdPatch({ legacyEnv: true, existing: null, incoming: "sp_1" }), "sp_1");
  const patch = webhookLeadUpdate({
    existingSendpilotLeadId: null,
    incomingLeadId: "sp_b",
    status: { normalized: "Interested", raw: "Interested", applyNormalized: true },
    nowIso: "2026-10-07T00:00:00.000Z",
    writeGlobalSendpilotLeadId: false,
  });
  assert.equal("sendpilot_lead_id" in patch, false);
});

test("R. external_id cannot cross-match integrations", () => {
  const decision = planWebhookMatch({
    integrationId: INT_B,
    legacyEnv: false,
    sendpilotLeadId: "sp_shared",
    scopedIdentityLead: null,
    legacyGlobalLead: null,
    scopedExternalLead: null,
    foreignExternalLead: { leadId: LEAD_A, contactId: CONTACT_A, sendpilotLeadId: "sp_shared" },
    ...emptyLists,
  });
  assert.equal(decision.kind, "unmatched");
  assert.match(applySource, /\.eq\("integration_id", integrationId\)/);
});

test("S. suppression cannot leak incorrectly across integrations", () => {
  assert.equal(
    suppressionAppliesToIntegration({
      suppressionIntegrationId: INT_A,
      webhookIntegrationId: INT_B,
      legacyEnv: false,
    }),
    false,
  );
  assert.equal(
    suppressionAppliesToIntegration({
      suppressionIntegrationId: INT_B,
      webhookIntegrationId: INT_B,
      legacyEnv: false,
    }),
    true,
  );
  assert.equal(
    suppressionAppliesToIntegration({
      suppressionIntegrationId: null,
      webhookIntegrationId: INT_B,
      legacyEnv: false,
    }),
    false,
  );
  assert.equal(
    suppressionAppliesToIntegration({
      suppressionIntegrationId: null,
      webhookIntegrationId: INT_A,
      legacyEnv: true,
    }),
    true,
  );
});

test("T. webhook event idempotency is integration-aware", () => {
  assert.match(migration, /add primary key \(integration_id, event_id\)/);
  assert.match(applySource, /\.eq\("integration_id", input.integrationId\)/);
});

test("Phase 5 webhook PK migration fails closed instead of guessing a legacy row", () => {
  assert.equal(/where legacy_env limit 1/.test(migration), false);
  assert.match(migration, /where legacy_env = true/);
  assert.match(migration, /if legacy_count = 0 then/);
  assert.match(migration, /if legacy_count > 1 then/);
  assert.match(migration, /raise exception/);
  assert.match(migration, /where integration_id is null/);
  assert.match(migration, /remaining_nulls > 0/);
  assert.match(migration, /having count\(\*\) > 1/);
  assert.match(migration, /duplicate \(integration_id, event_id\)/);
  assert.equal(/delete from public\.sendpilot_webhook_events/i.test(migration), false);
  const notNullAt = migration.indexOf("alter column integration_id set not null");
  const remainingAt = migration.indexOf("remaining_nulls > 0");
  const duplicateAt = migration.indexOf("having count(*) > 1");
  const dropPkAt = migration.indexOf("drop constraint if exists sendpilot_webhook_events_pkey");
  assert.ok(remainingAt > 0 && remainingAt < notNullAt);
  assert.ok(duplicateAt > 0 && duplicateAt < notNullAt);
  assert.ok(notNullAt > 0 && notNullAt < dropPkAt);
});

test("U/V. non-legacy CRM apply is blocked unless every safety gate passes", () => {
  const fail = crmApplySafetyGate({
    integrationPresent: true,
    loadedIntegrationId: INT_B,
    status: "draft",
    workspaceOk: true,
    campaignAllowed: true,
    scopedMatchingEnabled: true,
    usedLegacyEnvApiKeyForNonLegacy: false,
  });
  assert.equal(fail.allow, false);
  const envLeak = crmApplySafetyGate({
    integrationPresent: true,
    loadedIntegrationId: INT_B,
    status: "active",
    workspaceOk: true,
    campaignAllowed: true,
    scopedMatchingEnabled: true,
    usedLegacyEnvApiKeyForNonLegacy: true,
  });
  assert.equal(envLeak.allow, false);
  const ok = crmApplySafetyGate({
    integrationPresent: true,
    loadedIntegrationId: INT_B,
    requestedIntegrationId: INT_B,
    status: "active",
    workspaceOk: true,
    campaignAllowed: true,
    scopedMatchingEnabled: true,
    usedLegacyEnvApiKeyForNonLegacy: false,
  });
  assert.equal(ok.allow, true);
});

test("Y. Settings/management and review hold possible_same_person without auto-resolve", () => {
  assert.match(reviewSource, /possible_same_person/);
  assert.match(reviewSource, /Cross-integration identity linking is held/);
  assert.match(applySource, /planWebhookMatch/);
});
