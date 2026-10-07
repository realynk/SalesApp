export const LEGACY_INTEGRATION_NAME = "Realynk Main";

export function resolveLegacyWorkspaceId(workspaceIds: Array<string | null | undefined>): string | null {
  const unique = [
    ...new Set(
      workspaceIds
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  ];
  return unique.length === 1 ? unique[0]! : null;
}

export function campaignIdFromEnvelopeData(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;
  const value = data.campaignId;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

export function uniqueCampaignIdForLead(
  events: Array<{ campaignId?: string | null }>,
): string | null {
  const unique = [
    ...new Set(
      events
        .map((event) => event.campaignId?.trim() ?? "")
        .filter(Boolean),
    ),
  ];
  return unique.length === 1 ? unique[0]! : null;
}

export type LeadIdentitySeed = {
  integrationId: string;
  sendpilotLeadId: string;
  leadId: string;
  campaignId: string | null;
};

export function planLegacyIdentityBackfill(input: {
  integrationId: string;
  leads: Array<{ id: string; sendpilotLeadId: string | null }>;
  existing: Array<{ integrationId: string; sendpilotLeadId: string }>;
  campaignByLeadId: Record<string, string | null | undefined>;
}): LeadIdentitySeed[] {
  const existingKeys = new Set(input.existing.map((row) => `${row.integrationId}::${row.sendpilotLeadId}`));
  const planned: LeadIdentitySeed[] = [];
  for (const lead of input.leads) {
    const sendpilotLeadId = lead.sendpilotLeadId?.trim() || "";
    if (!sendpilotLeadId) continue;
    const key = `${input.integrationId}::${sendpilotLeadId}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    planned.push({
      integrationId: input.integrationId,
      sendpilotLeadId,
      leadId: lead.id,
      campaignId: input.campaignByLeadId[sendpilotLeadId]?.trim() || null,
    });
  }
  return planned;
}

export function identitiesAllowSameLeadIdAcrossIntegrations(
  rows: Array<{ integrationId: string; sendpilotLeadId: string }>,
): boolean {
  const keys = new Set(rows.map((row) => `${row.integrationId}::${row.sendpilotLeadId}`));
  return keys.size === rows.length;
}
