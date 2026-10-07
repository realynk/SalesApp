import { publicAppBaseUrl } from "@/lib/env";
import { raiseIf } from "@/lib/errors";
import { requireUser } from "@/server/session";
import { canManageSendPilotCredentials } from "./credentials";
import {
  sanitizeAuditMetadata,
  toSafeIntegrationView,
  webhookUrlForIntegration,
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

export type SendPilotCampaignRow = {
  sendpilotCampaignId: string;
  name: string | null;
  remoteStatus: string | null;
  lastSeenAt: string | null;
  tracked: boolean;
};

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
      "id, name, workspace_id, status, tracking_mode, legacy_env, last_webhook_at, last_campaign_sync_at, created_at, credentials_present",
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
      "id, name, workspace_id, status, tracking_mode, legacy_env, last_webhook_at, last_webhook_event_type, last_campaign_sync_at, created_at, credentials_present",
    )
    .eq("id", id)
    .maybeSingle();
  raiseIf(error);
  if (!data) return null;
  const row = data as Row;

  const { data: campaigns, error: campaignError } = await supabase
    .from("sendpilot_campaigns")
    .select("sendpilot_campaign_id, name, remote_status, last_seen_at")
    .eq("integration_id", id)
    .order("name", { ascending: true });
  raiseIf(campaignError);

  const { data: tracking, error: trackingError } = await supabase
    .from("sendpilot_campaign_tracking")
    .select("sendpilot_campaign_id, tracked")
    .eq("integration_id", id);
  raiseIf(trackingError);
  const tracked = new Map(
    (tracking ?? []).map((item) => [str((item as Row).sendpilot_campaign_id) ?? "", bool((item as Row).tracked)]),
  );

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
    lastWebhookAt: str(row.last_webhook_at),
    lastCampaignSyncAt: str(row.last_campaign_sync_at),
    createdAt: str(row.created_at),
    campaignCount: (campaigns ?? []).length,
    trackedCount: [...tracked.values()].filter(Boolean).length,
  });

  return {
    ...view,
    webhookUrl: webhookUrlForIntegration({
      id: view.id,
      legacyEnv: view.legacyEnv,
      baseUrl: publicAppBaseUrl(),
    }),
    lastWebhookEventType: str(row.last_webhook_event_type),
    campaigns: (campaigns ?? []).map((item) => {
      const campaign = item as Row;
      const campaignId = str(campaign.sendpilot_campaign_id) || "";
      return {
        sendpilotCampaignId: campaignId,
        name: str(campaign.name),
        remoteStatus: str(campaign.remote_status),
        lastSeenAt: str(campaign.last_seen_at),
        tracked: tracked.get(campaignId) ?? view.trackingMode === "all",
      };
    }),
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
