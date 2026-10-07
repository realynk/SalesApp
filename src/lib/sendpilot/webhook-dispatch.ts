import { applySendPilotWebhook } from "./apply";
import { resolveIntegrationApiKey, resolveIntegrationWebhookSecret } from "./credentials";
import type { LegacySendPilotIntegration } from "./integration";
import { genericWebhookUnauthorizedBody, isUuid } from "./policy";
import { verifySendPilotSignature } from "./signature";

export type IntegrationCredentialCiphertexts = {
  webhookSecretCiphertext: string | null;
  apiKeyCiphertext: string | null;
};

export type DynamicWebhookLoaders = {
  loadIntegration: (id: string) => Promise<LegacySendPilotIntegration | null>;
  loadCredentialCiphertexts: (id: string) => Promise<IntegrationCredentialCiphertexts | null>;
};

export async function handleDynamicSendPilotWebhook(input: {
  integrationId: string;
  rawBody: string;
  headers: Headers;
  loaders: DynamicWebhookLoaders;
  apply?: typeof applySendPilotWebhook;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  if (!isUuid(input.integrationId)) {
    return { httpStatus: 401, body: genericWebhookUnauthorizedBody() };
  }

  let integration: LegacySendPilotIntegration | null;
  try {
    integration = await input.loaders.loadIntegration(input.integrationId);
  } catch {
    return { httpStatus: 503, body: { error: "SendPilot webhook verification is not configured." } };
  }
  if (!integration || integration.id !== input.integrationId) {
    return { httpStatus: 401, body: genericWebhookUnauthorizedBody() };
  }

  let ciphertexts: IntegrationCredentialCiphertexts | null;
  try {
    ciphertexts = await input.loaders.loadCredentialCiphertexts(integration.id);
  } catch {
    return { httpStatus: 503, body: { error: "SendPilot webhook verification is not configured." } };
  }

  const resolved = resolveIntegrationWebhookSecret({
    integration,
    webhookSecretCiphertext: ciphertexts?.webhookSecretCiphertext ?? null,
    requestedIntegrationId: input.integrationId,
  });
  if (!resolved.ok) {
    if (resolved.reason === "missing_encryption_key") {
      return { httpStatus: 503, body: { error: "SendPilot webhook verification is not configured." } };
    }
    console.error("[sendpilot.webhook]", { outcome: "rejected", reason: "invalid_signature" });
    return { httpStatus: 401, body: genericWebhookUnauthorizedBody() };
  }

  const verified = verifySendPilotSignature({
    rawBody: input.rawBody,
    headers: input.headers,
    secret: resolved.secret.value,
  });
  if (!verified.ok) {
    console.error("[sendpilot.webhook]", { outcome: "rejected", reason: verified.reason === "missing_secret" ? "invalid_signature" : verified.reason });
    return {
      httpStatus: verified.status === 503 ? 503 : 401,
      body:
        verified.reason === "missing_secret"
          ? { error: "SendPilot webhook verification is not configured." }
          : genericWebhookUnauthorizedBody(),
    };
  }

  const api = resolveIntegrationApiKey({
    integration,
    apiKeyCiphertext: ciphertexts?.apiKeyCiphertext ?? null,
    requestedIntegrationId: input.integrationId,
  });

  const apply = input.apply ?? applySendPilotWebhook;
  return apply(input.rawBody, {
    integration,
    apiKey: api.apiKey,
  });
}
