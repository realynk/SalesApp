import { resolveSendPilotApiAuth } from "./client";
import { planCampaignSync } from "./campaign-sync";
import {
  ACTIVATION_ALREADY_ACTIVE,
  ACTIVATION_API_KEY_MISSING,
  ACTIVATION_CRM_PATH_UNAVAILABLE,
  ACTIVATION_TRACKING_INVALID,
  ACTIVATION_WEBHOOK_SECRET_MISSING,
  ACTIVATION_WEBHOOK_URL_UNAVAILABLE,
  INTEGRATION_NOT_FOUND,
  LEGACY_MUTATION_DENIED,
  SELECTED_REQUIRES_CAMPAIGN,
  SENDPILOT_ADMIN_DENIED,
} from "./manage-copy";
import { isUuid, shouldApplyCrm } from "./policy";

export {
  ACTIVATION_ALREADY_ACTIVE,
  ACTIVATION_API_KEY_MISSING,
  ACTIVATION_BLOCKED,
  ACTIVATION_CRM_PATH_UNAVAILABLE,
  ACTIVATION_TRACKING_INVALID,
  ACTIVATION_WEBHOOK_SECRET_MISSING,
  ACTIVATION_WEBHOOK_URL_UNAVAILABLE,
  API_KEY_SAVED_MESSAGE,
  CRM_NOT_ENABLED_MESSAGE,
  ENCRYPTION_NOT_CONFIGURED,
  INTEGRATION_NOT_FOUND,
  LEGACY_MUTATION_DENIED,
  LEGACY_PROTECTED_MESSAGE,
  SELECTED_REQUIRES_CAMPAIGN,
  SENDPILOT_ADMIN_DENIED,
  TRACKING_ONBOARDING_MESSAGE,
  WEBHOOK_SECRET_SAVED_MESSAGE,
  WEBHOOK_SETUP_MESSAGE,
} from "./manage-copy";

export const PHASE_5_SCOPED_MATCHING_AVAILABLE = true;

export const DEFAULT_NEW_STATUS = "draft" as const;

const SECRET_METADATA_KEYS = [
  "api_key",
  "apikey",
  "webhook_secret",
  "webhooksecret",
  "webhook_signing_secret",
  "ciphertext",
  "api_key_ciphertext",
  "webhook_secret_ciphertext",
  "sendpilot_api_key",
  "sendpilot_webhook_secret",
  "sendpilot_secrets_encryption_key",
  "password",
  "credential",
  "credentials",
];

export type TrackingMode = "all" | "selected";
export type IntegrationStatus = "draft" | "active" | "disabled" | "removed";
export type CredentialStatus = "configured" | "legacy_environment" | "not_configured";

export type SafeIntegrationView = {
  id: string;
  name: string;
  workspaceId: string | null;
  status: string;
  trackingMode: TrackingMode;
  legacyEnv: boolean;
  credentialStatus: CredentialStatus;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  lastWebhookAt: string | null;
  lastCampaignSyncAt: string | null;
  createdAt: string | null;
  campaignCount: number;
  trackedCount: number;
  crmSyncEnabled: boolean;
};

export function authorizeSendPilotMutation(role: string | null | undefined): { ok: true } | { ok: false; error: string } {
  if (role !== "sales_lead") return { ok: false, error: SENDPILOT_ADMIN_DENIED };
  return { ok: true };
}

export function credentialStatus(input: { legacyEnv: boolean; credentialsPresent: boolean }): CredentialStatus {
  if (input.legacyEnv) return "legacy_environment";
  if (input.credentialsPresent) return "configured";
  return "not_configured";
}

export function credentialStatusLabel(status: CredentialStatus) {
  if (status === "legacy_environment") return "Legacy environment";
  if (status === "configured") return "Configured";
  return "Not configured";
}

export function fieldCredentialLabel(input: { legacyEnv: boolean; configured: boolean }) {
  if (input.legacyEnv) return "Legacy environment";
  return input.configured ? "Configured" : "Missing";
}

export function webhookPathForIntegration(input: { id: string; legacyEnv: boolean }) {
  if (input.legacyEnv) return "/api/sendpilot/webhook";
  return `/api/sendpilot/webhook/${input.id}`;
}

export function webhookUrlForIntegration(input: { id: string; legacyEnv: boolean; baseUrl: string }) {
  const path = webhookPathForIntegration(input);
  const base = input.baseUrl.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export function parseManagedIntegrationId(value: string | null | undefined) {
  const id = value?.trim() ?? "";
  if (!isUuid(id)) return { error: INTEGRATION_NOT_FOUND } as const;
  return { id };
}

export function looksLikeSecretValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("whsec_")) return true;
  if (/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return true;
  return false;
}

export function sanitizeAuditMetadata(value: unknown): Record<string, unknown> {
  return sanitizeUnknown(value) as Record<string, unknown>;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return looksLikeSecretValue(value) ? "[redacted]" : value;
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SECRET_METADATA_KEYS.some((item) => normalized.includes(item.replace(/_/g, "")))) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeUnknown(nested);
  }
  return out;
}

export function assertSafeClientPayload(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  if (looksLikeSecretValue(json) || json.includes("ciphertext") || /whsec_|SENDPILOT_SECRETS_ENCRYPTION_KEY/.test(json)) {
    throw new Error("Refusing to return a payload that may contain secrets.");
  }
  return payload;
}

export function planNewIntegrationRow(input: {
  name: string;
  actorId: string;
  trackingMode: TrackingMode;
}) {
  const name = input.name.trim();
  if (name.length < 2) return { error: "Enter an integration name." } as const;
  return {
    row: {
      name,
      workspace_id: null as string | null,
      status: DEFAULT_NEW_STATUS,
      tracking_mode: input.trackingMode,
      legacy_env: false,
      created_by: input.actorId,
      credentials_present: false,
      api_key_configured: false,
      webhook_secret_configured: false,
    },
  } as const;
}

export type ActivationPlanInput = {
  legacyEnv: boolean;
  status: string;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  trackingMode: string;
  selectedCampaignIds: string[];
  integrationId: string;
  scopedMatchingEnabled?: boolean;
};

export function planActivation(input: ActivationPlanInput) {
  if (input.legacyEnv) return { error: LEGACY_MUTATION_DENIED } as const;
  if (input.status === "removed") return { error: INTEGRATION_NOT_FOUND } as const;
  if (input.status === "active") return { error: ACTIVATION_ALREADY_ACTIVE } as const;
  if (!input.apiKeyConfigured) return { error: ACTIVATION_API_KEY_MISSING } as const;
  if (!input.webhookSecretConfigured) return { error: ACTIVATION_WEBHOOK_SECRET_MISSING } as const;
  if (!isUuid(input.integrationId)) return { error: ACTIVATION_WEBHOOK_URL_UNAVAILABLE } as const;
  const tracking = planTrackingModeChange({
    legacyEnv: input.legacyEnv,
    mode: input.trackingMode,
    selectedCampaignIds: input.selectedCampaignIds,
  });
  if ("error" in tracking) return { error: ACTIVATION_TRACKING_INVALID } as const;
  if (!(input.scopedMatchingEnabled ?? PHASE_5_SCOPED_MATCHING_AVAILABLE)) {
    return { error: ACTIVATION_CRM_PATH_UNAVAILABLE } as const;
  }
  return {
    patch: {
      status: "active" as const,
    },
  };
}

export function planDisable(input: { legacyEnv: boolean; status: string; nowIso: string }) {
  if (input.legacyEnv) return { error: LEGACY_MUTATION_DENIED } as const;
  if (input.status === "removed") return { error: INTEGRATION_NOT_FOUND } as const;
  return {
    patch: {
      status: "disabled" as const,
      disabled_at: input.nowIso,
    },
  };
}

export function planRemove(input: { legacyEnv: boolean; nowIso: string }) {
  if (input.legacyEnv) return { error: LEGACY_MUTATION_DENIED } as const;
  return {
    patch: {
      status: "removed" as const,
      removed_at: input.nowIso,
      removed_reason: "removed_from_settings",
    },
    hardDelete: false,
  };
}

export function planRotateCredentials(input: { legacyEnv: boolean }) {
  if (input.legacyEnv) return { error: LEGACY_MUTATION_DENIED } as const;
  return { ok: true as const };
}

export function parseTrackingMode(value: string | null | undefined): TrackingMode | null {
  const mode = value?.trim().toLowerCase();
  if (mode === "all" || mode === "selected") return mode;
  return null;
}

export function planTrackingModeChange(input: {
  legacyEnv: boolean;
  mode: string;
  selectedCampaignIds: string[];
}) {
  if (input.legacyEnv) return { error: LEGACY_MUTATION_DENIED } as const;
  const mode = parseTrackingMode(input.mode);
  if (!mode) return { error: "Choose All campaigns or Selected campaigns." } as const;
  if (mode === "selected" && input.selectedCampaignIds.length === 0) {
    return { error: SELECTED_REQUIRES_CAMPAIGN } as const;
  }
  return { mode };
}

export function uniqueCampaignIds(values: string[]) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export type DiscoveredCampaignRow = {
  sendpilotCampaignId: string;
  name: string | null;
  remoteStatus: string | null;
  lastSeenAt: string | null;
  tracked: boolean;
};

function asCampaignText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function campaignDisplayName(campaign: { name: string | null; sendpilotCampaignId: string }) {
  return campaign.name?.trim() || `Campaign ${campaign.sendpilotCampaignId}`;
}

export function mapDiscoveredCampaigns(input: {
  integrationId: string;
  campaigns: Record<string, unknown>[];
  tracking: Record<string, unknown>[];
  trackingMode: string;
}): DiscoveredCampaignRow[] {
  const trackingMode = parseTrackingMode(input.trackingMode) ?? "all";
  const trackedById = new Map<string, boolean>();
  for (const row of input.tracking) {
    const campaignId = asCampaignText(row.sendpilot_campaign_id);
    if (!campaignId) continue;
    trackedById.set(campaignId, row.tracked === true);
  }

  const seen = new Set<string>();
  const mapped: DiscoveredCampaignRow[] = [];
  for (const row of input.campaigns) {
    const owner = asCampaignText(row.integration_id);
    if (owner && owner !== input.integrationId) continue;
    const campaignId = asCampaignText(row.sendpilot_campaign_id);
    if (!campaignId || seen.has(campaignId)) continue;
    seen.add(campaignId);
    mapped.push({
      sendpilotCampaignId: campaignId,
      name: asCampaignText(row.name),
      remoteStatus: asCampaignText(row.remote_status),
      lastSeenAt: asCampaignText(row.last_seen_at),
      tracked: trackedById.get(campaignId) ?? trackingMode === "all",
    });
  }
  mapped.sort((a, b) => a.sendpilotCampaignId.localeCompare(b.sendpilotCampaignId));
  return mapped;
}

export function planCampaignTrackingRows(input: {
  integrationId: string;
  mode: TrackingMode;
  selectedCampaignIds: string[];
  existing: { sendpilotCampaignId: string; tracked: boolean }[];
  nowIso: string;
}) {
  const selected = new Set(uniqueCampaignIds(input.selectedCampaignIds));
  if (input.mode === "selected" && selected.size === 0) {
    return { error: SELECTED_REQUIRES_CAMPAIGN } as const;
  }
  const byId = new Map(input.existing.map((row) => [row.sendpilotCampaignId, row]));
  const upserts: {
    integration_id: string;
    sendpilot_campaign_id: string;
    tracked: boolean;
    untracked_at: string | null;
  }[] = [];

  if (input.mode === "selected") {
    for (const campaignId of selected) {
      upserts.push({
        integration_id: input.integrationId,
        sendpilot_campaign_id: campaignId,
        tracked: true,
        untracked_at: null,
      });
    }
    for (const row of input.existing) {
      if (selected.has(row.sendpilotCampaignId)) continue;
      upserts.push({
        integration_id: input.integrationId,
        sendpilot_campaign_id: row.sendpilotCampaignId,
        tracked: false,
        untracked_at: row.tracked ? input.nowIso : null,
      });
    }
  } else {
    for (const row of input.existing) {
      upserts.push({
        integration_id: input.integrationId,
        sendpilot_campaign_id: row.sendpilotCampaignId,
        tracked: true,
        untracked_at: null,
      });
    }
  }

  return { upserts, deleteExisting: false, knownIds: [...byId.keys()] };
}

export function campaignSyncStatus() {
  return planCampaignSync();
}

export function apiAuthForCampaignSync(input: {
  legacyEnv: boolean;
  integrationApiKey: string | null;
}) {
  const auth = resolveSendPilotApiAuth({
    integrationApiKey: input.integrationApiKey,
    allowLegacyEnvFallback: input.legacyEnv,
  });
  if (!auth) {
    return { error: "This integration has no API key of its own." } as const;
  }
  return auth;
}

export function credentialFlagsFromCiphertext(row: {
  api_key_ciphertext: string | null;
  webhook_secret_ciphertext: string | null;
}) {
  const apiKeyConfigured = Boolean(row.api_key_ciphertext?.trim());
  const webhookSecretConfigured = Boolean(row.webhook_secret_ciphertext?.trim());
  return {
    api_key_configured: apiKeyConfigured,
    webhook_secret_configured: webhookSecretConfigured,
    credentials_present: apiKeyConfigured && webhookSecretConfigured,
  };
}

export function toSafeIntegrationView(input: {
  id: string;
  name: string;
  workspaceId: string | null;
  status: string;
  trackingMode: string;
  legacyEnv: boolean;
  credentialsPresent: boolean;
  apiKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  lastWebhookAt: string | null;
  lastCampaignSyncAt: string | null;
  createdAt: string | null;
  campaignCount: number;
  trackedCount: number;
}): SafeIntegrationView {
  const trackingMode = parseTrackingMode(input.trackingMode) ?? "all";
  const apiKeyConfigured = input.apiKeyConfigured ?? input.credentialsPresent;
  const webhookSecretConfigured = input.webhookSecretConfigured ?? input.credentialsPresent;
  return {
    id: input.id,
    name: input.name,
    workspaceId: input.workspaceId,
    status: input.status,
    trackingMode,
    legacyEnv: input.legacyEnv,
    credentialStatus: credentialStatus({
      legacyEnv: input.legacyEnv,
      credentialsPresent: apiKeyConfigured && webhookSecretConfigured,
    }),
    apiKeyConfigured,
    webhookSecretConfigured,
    lastWebhookAt: input.lastWebhookAt,
    lastCampaignSyncAt: input.lastCampaignSyncAt,
    createdAt: input.createdAt,
    campaignCount: input.campaignCount,
    trackedCount: input.trackedCount,
    crmSyncEnabled: shouldApplyCrm({ legacyEnv: input.legacyEnv, status: input.status }),
  };
}

export function statusHeadline(view: Pick<SafeIntegrationView, "status" | "legacyEnv" | "crmSyncEnabled">) {
  if (view.legacyEnv) return "Active • Legacy Production";
  if (view.status === "draft") return "Draft • Setup incomplete";
  if (view.status === "disabled") return "Disabled";
  if (view.status === "removed") return "Removed";
  return view.status;
}

export type PlannedAudit = {
  action: string;
  campaign_id: string | null;
  metadata: Record<string, unknown>;
};

export function planCreateAudits(input: {
  trackingMode: TrackingMode;
  selectedCount: number;
}): PlannedAudit[] {
  return [
    {
      action: "integration_created",
      campaign_id: null,
      metadata: sanitizeAuditMetadata({
        status: DEFAULT_NEW_STATUS,
        tracking_mode: input.trackingMode,
        crm_apply_enabled: false,
        workspace_verified: false,
      }),
    },
    {
      action: "credentials_saved",
      campaign_id: null,
      metadata: sanitizeAuditMetadata({ source: "settings_create", credential: "api_key" }),
    },
    {
      action: "tracking_mode_changed",
      campaign_id: null,
      metadata: sanitizeAuditMetadata({
        tracking_mode: input.trackingMode,
        selected_count: input.selectedCount,
      }),
    },
  ];
}

export function planSafeSaveResult(input: {
  id: string;
  name: string;
  trackingMode: TrackingMode;
  webhookUrl: string;
  apiKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
}) {
  return assertSafeClientPayload({
    id: input.id,
    name: input.name,
    status: DEFAULT_NEW_STATUS,
    trackingMode: input.trackingMode,
    webhookUrl: input.webhookUrl,
    apiKeyStatus: input.apiKeyConfigured ? "Configured" : "Missing",
    webhookSecretStatus: input.webhookSecretConfigured ? "Configured" : "Missing",
    credentialStatus: input.apiKeyConfigured && input.webhookSecretConfigured ? "configured" : "not_configured",
    crmSyncEnabled: false,
    workspaceVerified: false,
  });
}

export function planPartialCredentialUpdate(input: {
  existing: { api_key_ciphertext: string | null; webhook_secret_ciphertext: string | null } | undefined;
  apiKey?: string | null;
  webhookSecret?: string | null;
}) {
  const nextApi = input.apiKey?.trim() ? "incoming" : input.existing?.api_key_ciphertext?.trim() ? "existing" : "none";
  const nextWebhook = input.webhookSecret?.trim()
    ? "incoming"
    : input.existing?.webhook_secret_ciphertext?.trim()
      ? "existing"
      : "none";
  return { preservesApiKey: nextApi !== "none", preservesWebhookSecret: nextWebhook !== "none", nextApi, nextWebhook };
}
