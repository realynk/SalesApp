export type LegacySendPilotIntegration = {
  id: string;
  name: string;
  workspaceId: string | null;
  status: string;
  trackingMode: string;
  legacyEnv: boolean;
};

export function parseLegacySendPilotIntegration(row: {
  id: unknown;
  name?: unknown;
  workspace_id?: unknown;
  status?: unknown;
  tracking_mode?: unknown;
  legacy_env?: unknown;
} | null): LegacySendPilotIntegration | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    name: row.name ? String(row.name) : "",
    workspaceId: typeof row.workspace_id === "string" && row.workspace_id.trim() ? row.workspace_id.trim() : null,
    status: row.status ? String(row.status) : "",
    trackingMode: row.tracking_mode ? String(row.tracking_mode) : "all",
    legacyEnv: Boolean(row.legacy_env),
  };
}

export function workspaceMismatch(
  envelopeWorkspaceId: string | null | undefined,
  integrationWorkspaceId: string | null | undefined,
): boolean {
  const incoming = envelopeWorkspaceId?.trim() || "";
  const expected = integrationWorkspaceId?.trim() || "";
  if (!incoming || !expected) return false;
  return incoming !== expected;
}

export function resolveWebhookCampaignId(
  payloadCampaignId: string | null | undefined,
  apiCampaignId: string | null | undefined,
): string | null {
  const fromPayload = payloadCampaignId?.trim() || "";
  if (fromPayload) return fromPayload;
  const fromApi = apiCampaignId?.trim() || "";
  return fromApi || null;
}

export function webhookActivityIntegrationMetadata(input: {
  integrationId: string;
  campaignId: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    integrationId: input.integrationId,
    campaignId: input.campaignId,
    ...(input.extra ?? {}),
  };
}

export type IdentityDualWriteDecision =
  | { action: "skip" }
  | {
      action: "insert";
      row: {
        integration_id: string;
        sendpilot_lead_id: string;
        lead_id: string;
        sendpilot_campaign_id: string | null;
        first_seen_at: string;
        last_seen_at: string;
      };
    }
  | {
      action: "update";
      patch: {
        lead_id: string;
        sendpilot_campaign_id: string | null;
        last_seen_at: string;
      };
    }
  | {
      action: "conflict";
      existingLeadId: string;
      resolvedLeadId: string;
    };

export function planIdentityDualWrite(input: {
  integrationId: string;
  sendpilotLeadId: string | null | undefined;
  resolvedLeadId: string | null | undefined;
  campaignId: string | null | undefined;
  existing: { leadId: string | null; campaignId: string | null } | null;
  nowIso: string;
}): IdentityDualWriteDecision {
  const sendpilotLeadId = input.sendpilotLeadId?.trim() || "";
  const resolvedLeadId = input.resolvedLeadId?.trim() || "";
  if (!sendpilotLeadId || !resolvedLeadId) return { action: "skip" };

  const campaignId = input.campaignId?.trim() || null;

  if (!input.existing) {
    return {
      action: "insert",
      row: {
        integration_id: input.integrationId,
        sendpilot_lead_id: sendpilotLeadId,
        lead_id: resolvedLeadId,
        sendpilot_campaign_id: campaignId,
        first_seen_at: input.nowIso,
        last_seen_at: input.nowIso,
      },
    };
  }

  if (input.existing.leadId && input.existing.leadId !== resolvedLeadId) {
    return {
      action: "conflict",
      existingLeadId: input.existing.leadId,
      resolvedLeadId,
    };
  }

  return {
    action: "update",
    patch: {
      lead_id: input.existing.leadId || resolvedLeadId,
      sendpilot_campaign_id: campaignId || input.existing.campaignId,
      last_seen_at: input.nowIso,
    },
  };
}
