import assert from "node:assert/strict";
import test from "node:test";
import { resolveSendPilotApiAuth } from "./client.ts";
import {
  campaignGate,
  genericWebhookUnauthorizedBody,
  integrationStatusIgnoreReason,
  isUuid,
  shouldApplyCrm,
} from "./policy.ts";

test("status gating verifies then ignores draft, disabled, and removed", () => {
  assert.equal(integrationStatusIgnoreReason("active"), null);
  assert.equal(integrationStatusIgnoreReason("draft"), "integration_draft");
  assert.equal(integrationStatusIgnoreReason("disabled"), "integration_disabled");
  assert.equal(integrationStatusIgnoreReason("removed"), "integration_removed");
});

test("legacy integrations skip campaign gating including missing campaignId", () => {
  assert.deepEqual(
    campaignGate({ legacyEnv: true, trackingMode: "all", campaignId: null, tracked: false }),
    { allow: true },
  );
});

test("non-legacy selected campaign tracked passes the gate", () => {
  assert.deepEqual(
    campaignGate({ legacyEnv: false, trackingMode: "selected", campaignId: "camp_a", tracked: true }),
    { allow: true },
  );
});

test("non-legacy selected campaign not tracked is ignored", () => {
  assert.deepEqual(
    campaignGate({ legacyEnv: false, trackingMode: "selected", campaignId: "camp_a", tracked: false }),
    { allow: false, reason: "campaign_not_tracked" },
  );
});

test("non-legacy missing campaign is ignored", () => {
  assert.deepEqual(
    campaignGate({ legacyEnv: false, trackingMode: "all", campaignId: null, tracked: false }),
    { allow: false, reason: "campaign_unknown" },
  );
  assert.deepEqual(
    campaignGate({ legacyEnv: false, trackingMode: "selected", campaignId: "  ", tracked: true }),
    { allow: false, reason: "campaign_unknown" },
  );
});

test("CRM apply is enabled only for the legacy integration", () => {
  assert.equal(shouldApplyCrm({ legacyEnv: true }), true);
  assert.equal(shouldApplyCrm({ legacyEnv: false }), false);
});

test("campaign API fallback never uses the legacy env key for non-legacy integrations", () => {
  const previous = process.env.SENDPILOT_API_KEY;
  process.env.SENDPILOT_API_KEY = "legacy_env_key";
  try {
    assert.equal(resolveSendPilotApiAuth({ integrationApiKey: null, allowLegacyEnvFallback: false }), null);
    assert.deepEqual(resolveSendPilotApiAuth({ integrationApiKey: "int_b_key", allowLegacyEnvFallback: false }), {
      apiKey: "int_b_key",
    });
    assert.deepEqual(resolveSendPilotApiAuth({ integrationApiKey: null, allowLegacyEnvFallback: true }), {
      apiKey: "legacy_env_key",
    });
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_API_KEY;
    else process.env.SENDPILOT_API_KEY = previous;
  }
});

test("unauthenticated webhook errors do not reveal whether an integration id exists", () => {
  assert.deepEqual(genericWebhookUnauthorizedBody(), { error: "Invalid SendPilot webhook signature." });
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), true);
});
