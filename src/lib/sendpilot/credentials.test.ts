import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertCredentialAdmin,
  buildCredentialCiphertextRow,
  canManageSendPilotCredentials,
  planLegacyCredentialMigration,
  resolveIntegrationApiKey,
  resolveIntegrationWebhookSecret,
} from "./credentials.ts";
import { encryptSecret } from "./secrets.ts";

const KEY = "c".repeat(64);
const INTEGRATION = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", legacyEnv: false };
const LEGACY = { id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", legacyEnv: true };

test("admin check uses sales_lead and not user_metadata", () => {
  assert.equal(canManageSendPilotCredentials("sales_lead"), true);
  assert.equal(canManageSendPilotCredentials("recruiter"), false);
  assert.equal(canManageSendPilotCredentials("member"), false);
  assert.throws(() => assertCredentialAdmin("recruiter"), /admin/);
});

test("resolves only the requested integration's encrypted webhook secret", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    const ciphertext = encryptSecret("whsec_integration_a");
    const ok = resolveIntegrationWebhookSecret({
      integration: INTEGRATION,
      webhookSecretCiphertext: ciphertext,
      requestedIntegrationId: INTEGRATION.id,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.secret.value, "whsec_integration_a");
      assert.equal(ok.secret.source, "encrypted");
    }
    const leaked = resolveIntegrationWebhookSecret({
      integration: INTEGRATION,
      webhookSecretCiphertext: ciphertext,
      requestedIntegrationId: LEGACY.id,
    });
    assert.equal(leaked.ok, false);
    if (!leaked.ok) assert.equal(leaked.reason, "wrong_integration");
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("legacy_env webhook secret falls back to env when ciphertext is absent", () => {
  const previousSecret = process.env.SENDPILOT_WEBHOOK_SECRET;
  process.env.SENDPILOT_WEBHOOK_SECRET = "whsec_env_legacy";
  try {
    const resolved = resolveIntegrationWebhookSecret({
      integration: LEGACY,
      webhookSecretCiphertext: null,
      requestedIntegrationId: LEGACY.id,
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.secret.value, "whsec_env_legacy");
      assert.equal(resolved.secret.source, "legacy_env");
    }
    const nonLegacy = resolveIntegrationWebhookSecret({
      integration: INTEGRATION,
      webhookSecretCiphertext: null,
      requestedIntegrationId: INTEGRATION.id,
    });
    assert.equal(nonLegacy.ok, false);
  } finally {
    if (previousSecret === undefined) delete process.env.SENDPILOT_WEBHOOK_SECRET;
    else process.env.SENDPILOT_WEBHOOK_SECRET = previousSecret;
  }
});

test("non-legacy API key does not fall back to the Account 1 env key", () => {
  const previous = process.env.SENDPILOT_API_KEY;
  process.env.SENDPILOT_API_KEY = "account_1_key";
  try {
    const leaked = resolveIntegrationApiKey({
      integration: INTEGRATION,
      apiKeyCiphertext: null,
      requestedIntegrationId: INTEGRATION.id,
    });
    assert.equal(leaked.apiKey, null);
    assert.equal(leaked.source, "none");
    const legacy = resolveIntegrationApiKey({
      integration: LEGACY,
      apiKeyCiphertext: null,
      requestedIntegrationId: LEGACY.id,
    });
    assert.equal(legacy.apiKey, "account_1_key");
    assert.equal(legacy.source, "legacy_env");
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_API_KEY;
    else process.env.SENDPILOT_API_KEY = previous;
  }
});

test("adding a webhook secret preserves the existing API key ciphertext", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    const existingApi = encryptSecret("sp_keep_api");
    const row = buildCredentialCiphertextRow({
      integrationId: INTEGRATION.id,
      webhookSecret: "whsec_added_later",
      existing: { api_key_ciphertext: existingApi, webhook_secret_ciphertext: null },
      nowIso: "2026-10-07T00:00:00.000Z",
    });
    assert.equal(row.api_key_ciphertext, existingApi);
    assert.match(row.webhook_secret_ciphertext ?? "", /^v1\./);
    assert.equal(row.webhook_secret_ciphertext?.includes("whsec_added_later"), false);
    assert.equal(row.api_key_ciphertext?.includes("sp_keep_api"), false);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("rotating the API key preserves the existing webhook secret ciphertext", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    const existingWebhook = encryptSecret("whsec_keep");
    const row = buildCredentialCiphertextRow({
      integrationId: INTEGRATION.id,
      apiKey: "sp_rotated",
      existing: { api_key_ciphertext: "v1.old-api", webhook_secret_ciphertext: existingWebhook },
      nowIso: "2026-10-07T00:00:00.000Z",
    });
    assert.equal(row.webhook_secret_ciphertext, existingWebhook);
    assert.notEqual(row.api_key_ciphertext, "v1.old-api");
    assert.equal(row.api_key_ciphertext?.includes("sp_rotated"), false);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("credential rows store ciphertext and never plaintext", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = KEY;
  try {
    const row = buildCredentialCiphertextRow({
      integrationId: INTEGRATION.id,
      apiKey: "sp_live_key",
      webhookSecret: "whsec_live",
      nowIso: "2026-10-07T00:00:00.000Z",
    });
    assert.equal(row.api_key_ciphertext?.includes("sp_live_key"), false);
    assert.equal(row.webhook_secret_ciphertext?.includes("whsec_live"), false);
    assert.match(row.api_key_ciphertext ?? "", /^v1\./);
    assert.match(row.webhook_secret_ciphertext ?? "", /^v1\./);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("legacy credential migration planner is idempotent and does not run itself", () => {
  assert.equal(
    planLegacyCredentialMigration({
      hasWebhookCiphertext: true,
      hasApiCiphertext: true,
      envApiKey: "k",
      envWebhookSecret: "s",
    }),
    "skip_already_encrypted",
  );
  assert.equal(
    planLegacyCredentialMigration({
      hasWebhookCiphertext: false,
      hasApiCiphertext: false,
      envApiKey: "k",
      envWebhookSecret: "s",
    }),
    "encrypt_env",
  );
});

test("credential RPCs are not granted to authenticated clients", () => {
  const migration = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261007180000_sendpilot_credential_grants.sql"),
    "utf8",
  );
  assert.match(migration, /revoke all on function public\.sendpilot_load_integration_credentials/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.sendpilot_load_integration_credentials\(uuid\) to service_role/);
  assert.equal(/grant execute[^\n]+authenticated/.test(migration), false);
});
