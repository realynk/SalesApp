import { publicAppBaseUrl } from "@/lib/env";
import { raiseIf } from "@/lib/errors";
import { requireUser } from "@/server/session";
import { canManageSendPilotCredentials } from "./credentials";
import {
  mapDiscoveredCampaigns,
  sanitizeAuditMetadata,
  toSafeIntegrationView,
  webhookUrlForIntegration,
  type DiscoveredCampaignRow,
  type SafeIntegrationView,
} from "./manage";

type Row = Record<string, unknown>;

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown) {
  return value === true;
}

export type SendPilotAuditRow = {
  id: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type SendPilotCampaignRow = DiscoveredCampaignRow;

export type SendPilotIntegrationDetail = SafeIntegrationView & {
  webhookUrl: string;
  lastWebhookEventType: string | null;
  campaigns: SendPilotCampaignRow[];
  audits: SendPilotAuditRow[];
};

export async function loadSendPilotIntegrationList(): Promise<{
  canManage: boolean;
  integrations: SafeIntegrationView[];
}> {
  const { supabase, profile } = await requireUser();
  const { data, error } = await supabase
    .from("sendpilot_integrations")
    .select(
      "id, name, workspace_id, status, tracking_mode, legacy_env, last_webhook_at, last_campaign_sync_at, created_at, credentials_present, api_key_configured, webhook_secret_configured",
    )
    .order("legacy_env", { ascending: false })
    .order("created_at", { ascending: true });
  raiseIf(error);

  const ids = (data ?? []).map((row) => String((row as Row).id));
  const campaignCounts = new Map<string, number>();
  const trackedCounts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: campaigns, error: campaignError } = await supabase
      .from("sendpilot_campaigns")
      .select("integration_id")
      .in("integration_id", ids);
    raiseIf(campaignError);
    for (const row of campaigns ?? []) {
      const id = str((row as Row).integration_id);
      if (!id) continue;
      campaignCounts.set(id, (campaignCounts.get(id) ?? 0) + 1);
    }
    const { data: tracking, error: trackingError } = await supabase
      .from("sendpilot_campaign_tracking")
      .select("integration_id, tracked")
      .in("integration_id", ids);
    raiseIf(trackingError);
    for (const row of tracking ?? []) {
      const id = str((row as Row).integration_id);
      if (!id || !bool((row as Row).tracked)) continue;
      trackedCounts.set(id, (trackedCounts.get(id) ?? 0) + 1);
    }
  }

  const integrations = (data ?? []).map((raw) => {
    const row = raw as Row;
    const id = String(row.id);
    return toSafeIntegrationView({
      id,
      name: str(row.name) || "Untitled",
      workspaceId: str(row.workspace_id),
      status: str(row.status) || "draft",
      trackingMode: str(row.tracking_mode) || "all",
      legacyEnv: bool(row.legacy_env),
      credentialsPresent: bool(row.credentials_present),
      apiKeyConfigured: bool(row.api_key_configured),
      webhookSecretConfigured: bool(row.webhook_secret_configured),
      lastWebhookAt: str(row.last_webhook_at),
      lastCampaignSyncAt: str(row.last_campaign_sync_at),
      createdAt: str(row.created_at),
      campaignCount: campaignCounts.get(id) ?? 0,
      trackedCount: trackedCounts.get(id) ?? 0,
    });
  });

  return {
    canManage: canManageSendPilotCredentials(profile?.role),
    integrations,
  };
}

export async function loadSendPilotIntegrationDetail(id: string): Promise<SendPilotIntegrationDetail | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("sendpilot_integrations")
    .select(
      "id, name, workspace_id, status, tracking_mode, legacy_env, last_webhook_at, last_webhook_event_type, last_campaign_sync_at, created_at, credentials_present, api_key_configured, webhook_secret_configured",
    )
    .eq("id", id)
    .maybeSingle();
  raiseIf(error);
  if (!data) return null;
  const row = data as Row;

  const { data: campaigns, error: campaignError } = await supabase
    .from("sendpilot_campaigns")
    .select("integration_id, sendpilot_campaign_id, name, remote_status, last_seen_at")
    .eq("integration_id", id)
    .order("sendpilot_campaign_id", { ascending: true });
  raiseIf(campaignError);

  const { data: tracking, error: trackingError } = await supabase
    .from("sendpilot_campaign_tracking")
    .select("sendpilot_campaign_id, tracked")
    .eq("integration_id", id);
  raiseIf(trackingError);
  const mappedCampaigns = mapDiscoveredCampaigns({
    integrationId: id,
    campaigns: (campaigns ?? []) as Row[],
    tracking: (tracking ?? []) as Row[],
    trackingMode: str(row.tracking_mode) || "all",
  });

  const { data: audits, error: auditError } = await supabase
    .from("sendpilot_integration_audit")
    .select("id, action, created_at, metadata")
    .eq("integration_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  raiseIf(auditError);

  const view = toSafeIntegrationView({
    id: String(row.id),
    name: str(row.name) || "Untitled",
    workspaceId: str(row.workspace_id),
    status: str(row.status) || "draft",
    trackingMode: str(row.tracking_mode) || "all",
    legacyEnv: bool(row.legacy_env),
    credentialsPresent: bool(row.credentials_present),
    apiKeyConfigured: bool(row.api_key_configured),
    webhookSecretConfigured: bool(row.webhook_secret_configured),
    lastWebhookAt: str(row.last_webhook_at),
    lastCampaignSyncAt: str(row.last_campaign_sync_at),
    createdAt: str(row.created_at),
    campaignCount: mappedCampaigns.length,
    trackedCount: mappedCampaigns.filter((campaign) => campaign.tracked).length,
  });

  return {
    ...view,
    webhookUrl: webhookUrlForIntegration({
      id: view.id,
      legacyEnv: view.legacyEnv,
      baseUrl: publicAppBaseUrl(),
    }),
    lastWebhookEventType: str(row.last_webhook_event_type),
    campaigns: mappedCampaigns,
    audits: (audits ?? []).map((item) => {
      const audit = item as Row;
      return {
        id: String(audit.id),
        action: str(audit.action) || "unknown",
        createdAt: str(audit.created_at) || "",
        metadata: sanitizeAuditMetadata(audit.metadata ?? {}),
      };
    }),
  };
}
