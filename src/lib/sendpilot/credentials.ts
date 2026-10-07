import { decryptSecret, encryptSecret, SecretConfigError, SecretPayloadError } from "./secrets";
import { sendpilotApiKey, sendpilotWebhookSecret } from "./config";
import type { LegacySendPilotIntegration } from "./integration";

export function canManageSendPilotCredentials(role: string | null | undefined) {
  return role === "sales_lead";
}

export type CredentialSource = "encrypted" | "legacy_env" | "none";

export type ResolvedIntegrationSecret = {
  value: string;
  source: Exclude<CredentialSource, "none">;
};

function decryptField(ciphertext: string | null | undefined): { ok: true; value: string } | { ok: false; reason: "missing" | "config" | "invalid" } {
  const packed = ciphertext?.trim() || "";
  if (!packed) return { ok: false, reason: "missing" };
  try {
    const value = decryptSecret(packed);
    return value ? { ok: true, value } : { ok: false, reason: "invalid" };
  } catch (error) {
    if (error instanceof SecretConfigError) return { ok: false, reason: "config" };
    if (error instanceof SecretPayloadError) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "invalid" };
  }
}

export function resolveIntegrationWebhookSecret(input: {
  integration: Pick<LegacySendPilotIntegration, "id" | "legacyEnv">;
  webhookSecretCiphertext: string | null | undefined;
  requestedIntegrationId: string;
}):
  | { ok: true; secret: ResolvedIntegrationSecret }
  | { ok: false; reason: "wrong_integration" | "missing_secret" | "missing_encryption_key" | "invalid_secret" } {
  if (input.requestedIntegrationId !== input.integration.id) return { ok: false, reason: "wrong_integration" };
  const decrypted = decryptField(input.webhookSecretCiphertext);
  if (decrypted.ok) return { ok: true, secret: { value: decrypted.value, source: "encrypted" } };
  if (decrypted.reason === "config") return { ok: false, reason: "missing_encryption_key" };
  if (decrypted.reason === "invalid") return { ok: false, reason: "invalid_secret" };
  if (input.integration.legacyEnv) {
    const fallback = sendpilotWebhookSecret();
    if (fallback) return { ok: true, secret: { value: fallback, source: "legacy_env" } };
  }
  return { ok: false, reason: "missing_secret" };
}

export function resolveIntegrationApiKey(input: {
  integration: Pick<LegacySendPilotIntegration, "id" | "legacyEnv">;
  apiKeyCiphertext: string | null | undefined;
  requestedIntegrationId: string;
}): { apiKey: string | null; source: CredentialSource } {
  if (input.requestedIntegrationId !== input.integration.id) return { apiKey: null, source: "none" };
  const decrypted = decryptField(input.apiKeyCiphertext);
  if (decrypted.ok) return { apiKey: decrypted.value, source: "encrypted" };
  if (input.integration.legacyEnv) {
    const fallback = sendpilotApiKey();
    return fallback ? { apiKey: fallback, source: "legacy_env" } : { apiKey: null, source: "none" };
  }
  return { apiKey: null, source: "none" };
}

export function buildCredentialCiphertextRow(input: {
  integrationId: string;
  apiKey?: string | null;
  webhookSecret?: string | null;
  existing?: { api_key_ciphertext: string | null; webhook_secret_ciphertext: string | null };
  nowIso: string;
}) {
  const apiKey = input.apiKey?.trim();
  const webhookSecret = input.webhookSecret?.trim();
  return {
    integration_id: input.integrationId,
    api_key_ciphertext: apiKey ? encryptSecret(apiKey) : (input.existing?.api_key_ciphertext ?? null),
    webhook_secret_ciphertext: webhookSecret
      ? encryptSecret(webhookSecret)
      : (input.existing?.webhook_secret_ciphertext ?? null),
    key_version: 1,
    rotated_at: input.nowIso,
    updated_at: input.nowIso,
  };
}

export function planLegacyCredentialMigration(input: {
  hasWebhookCiphertext: boolean;
  hasApiCiphertext: boolean;
  envApiKey: string;
  envWebhookSecret: string;
}): "skip_already_encrypted" | "encrypt_env" | "nothing_to_migrate" {
  if (input.hasWebhookCiphertext && input.hasApiCiphertext) return "skip_already_encrypted";
  if (input.envApiKey.trim() || input.envWebhookSecret.trim()) return "encrypt_env";
  return "nothing_to_migrate";
}

export function assertCredentialAdmin(role: string | null | undefined) {
  if (!canManageSendPilotCredentials(role)) {
    throw new Error("SendPilot credentials can only be managed by an admin.");
  }
}
