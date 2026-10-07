import type { LegacySendPilotIntegration } from "./integration";

export type IntegrationIgnoreReason =
  | "integration_draft"
  | "integration_disabled"
  | "integration_removed"
  | "campaign_not_tracked"
  | "campaign_unknown"
  | "workspace_mismatch"
  | "crm_apply_not_enabled";

export function integrationStatusIgnoreReason(status: string | null | undefined): IntegrationIgnoreReason | null {
  const value = status?.trim().toLowerCase() || "";
  if (value === "active") return null;
  if (value === "draft") return "integration_draft";
  if (value === "disabled") return "integration_disabled";
  if (value === "removed") return "integration_removed";
  return "integration_disabled";
}

export function shouldApplyCrm(integration: Pick<LegacySendPilotIntegration, "legacyEnv"> & { status?: string }) {
  if (integrationStatusIgnoreReason(integration.status ?? "active")) return false;
  return true;
}

export function crmApplySafetyGate(input: {
  integrationPresent: boolean;
  loadedIntegrationId: string;
  requestedIntegrationId?: string | null;
  status: string;
  workspaceOk: boolean;
  campaignAllowed: boolean;
  scopedMatchingEnabled: boolean;
  usedLegacyEnvApiKeyForNonLegacy: boolean;
}): { allow: true } | { allow: false; reason: Extract<IntegrationIgnoreReason, "crm_apply_not_enabled"> } {
  if (!input.integrationPresent) return { allow: false, reason: "crm_apply_not_enabled" };
  if (input.requestedIntegrationId && input.requestedIntegrationId !== input.loadedIntegrationId) {
    return { allow: false, reason: "crm_apply_not_enabled" };
  }
  if (integrationStatusIgnoreReason(input.status)) return { allow: false, reason: "crm_apply_not_enabled" };
  if (!input.workspaceOk || !input.campaignAllowed) return { allow: false, reason: "crm_apply_not_enabled" };
  if (!input.scopedMatchingEnabled) return { allow: false, reason: "crm_apply_not_enabled" };
  if (input.usedLegacyEnvApiKeyForNonLegacy) return { allow: false, reason: "crm_apply_not_enabled" };
  return { allow: true };
}

export function campaignGate(input: {
  legacyEnv: boolean;
  trackingMode: string;
  campaignId: string | null | undefined;
  tracked: boolean;
}): { allow: true } | { allow: false; reason: Extract<IntegrationIgnoreReason, "campaign_unknown" | "campaign_not_tracked"> } {
  if (input.legacyEnv) return { allow: true };
  const campaignId = input.campaignId?.trim() || "";
  if (!campaignId) return { allow: false, reason: "campaign_unknown" };
  const mode = input.trackingMode.trim().toLowerCase();
  if (mode === "selected" && !input.tracked) return { allow: false, reason: "campaign_not_tracked" };
  return { allow: true };
}

export function genericWebhookUnauthorizedBody() {
  return { error: "Invalid SendPilot webhook signature." };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
