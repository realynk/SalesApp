import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "svix";
import { POST as legacyPost } from "../../app/api/sendpilot/webhook/route.ts";
import { encryptSecret } from "./secrets.ts";
import { handleDynamicSendPilotWebhook } from "./webhook-dispatch.ts";
import type { LegacySendPilotIntegration } from "./integration.ts";

const KEY = "d".repeat(64);
const SECRET_A = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const SECRET_B = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const RAW_BODY = '{"eventId":"evt_dyn","eventType":"lead.updated","workspaceId":"ws_b","data":{"leadId":"lead_1"}}';
const MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const INTEGRATION_A: LegacySendPilotIntegration = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "Future Account",
  workspaceId: "ws_b",
  status: "active",
  trackingMode: "selected",
  legacyEnv: false,
};

function signedHeaders(secret: string, rawBody = RAW_BODY) {
  const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000);
  const signature = new Webhook(secret).sign(MSG_ID, timestamp, rawBody);
  const unix = String(Math.floor(timestamp.getTime() / 1000));
  return new Headers({
    "svix-id": MSG_ID,
    "svix-timestamp": unix,
    "svix-signature": signature,
  });
}

function signedLegacyRequest(headers: HeadersInit) {
  return new Request("http://localhost/api/sendpilot/webhook", {
    method: "POST",
    headers,
    body: RAW_BODY,
  });
}

test("legacy POST /api/sendpilot/webhook still uses the env secret fallback", async () => {
  process.env.SENDPILOT_WEBHOOK_SECRET = SECRET_A;
  const missing = await legacyPost(signedLegacyRequest({ "user-agent": "Svix-Webhooks/rolling" }));
  assert.equal(missing.status, 401);
  const invalidHeaders = signedHeaders(SECRET_A);
  invalidHeaders.set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const invalid = await legacyPost(signedLegacyRequest(invalidHeaders));
  assert.equal(invalid.status, 401);
  const valid = await legacyPost(signedLegacyRequest(signedHeaders(SECRET_A)));
  assert.notEqual(valid.status, 401);
});

test("dynamic route loads the exact integration UUID and verifies only that secret", async () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  const ciphertext = encryptSecret(SECRET_A);
  const calls: unknown[] = [];
  try {
    const result = await handleDynamicSendPilotWebhook({
      integrationId: INTEGRATION_A.id,
      rawBody: RAW_BODY,
      headers: signedHeaders(SECRET_A),
      loaders: {
        async loadIntegration(id) {
          assert.equal(id, INTEGRATION_A.id);
          return { ...INTEGRATION_A };
        },
        async loadCredentialCiphertexts(id) {
          assert.equal(id, INTEGRATION_A.id);
          return { webhookSecretCiphertext: ciphertext, apiKeyCiphertext: encryptSecret("int_a_api") };
        },
      },
      apply: async (_raw, context) => {
        calls.push(context);
        return { httpStatus: 200, body: { ok: true, ignored: true, reason: "crm_apply_not_enabled" } };
      },
    });
    assert.equal(result.httpStatus, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { integration: INTEGRATION_A, apiKey: "int_a_api" });
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("wrong integration secret and invalid Svix signatures fail before apply", async () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  const ciphertext = encryptSecret(SECRET_A);
  let applyCalls = 0;
  const loaders = {
    async loadIntegration() {
      return { ...INTEGRATION_A };
    },
    async loadCredentialCiphertexts() {
      return { webhookSecretCiphertext: ciphertext, apiKeyCiphertext: null };
    },
  };
  try {
    const wrongSecret = await handleDynamicSendPilotWebhook({
      integrationId: INTEGRATION_A.id,
      rawBody: RAW_BODY,
      headers: signedHeaders(SECRET_B),
      loaders,
      apply: async () => {
        applyCalls += 1;
        return { httpStatus: 200, body: { ok: true } };
      },
    });
    assert.equal(wrongSecret.httpStatus, 401);
    const invalid = await handleDynamicSendPilotWebhook({
      integrationId: INTEGRATION_A.id,
      rawBody: RAW_BODY,
      headers: new Headers({ "user-agent": "Svix-Webhooks/rolling" }),
      loaders,
      apply: async () => {
        applyCalls += 1;
        return { httpStatus: 200, body: { ok: true } };
      },
    });
    assert.equal(invalid.httpStatus, 401);
    assert.equal(applyCalls, 0);
    assert.equal(wrongSecret.body.error, "Invalid SendPilot webhook signature.");
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("missing integration ids fail generically without apply", async () => {
  let applyCalls = 0;
  const result = await handleDynamicSendPilotWebhook({
    integrationId: INTEGRATION_A.id,
    rawBody: RAW_BODY,
    headers: signedHeaders(SECRET_A),
    loaders: {
      async loadIntegration() {
        return null;
      },
      async loadCredentialCiphertexts() {
        return null;
      },
    },
    apply: async () => {
      applyCalls += 1;
      return { httpStatus: 200, body: { ok: true } };
    },
  });
  assert.equal(result.httpStatus, 401);
  assert.equal(applyCalls, 0);
});
