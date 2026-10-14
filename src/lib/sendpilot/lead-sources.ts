export type SendPilotLeadSource = {
  leadId: string;
  integrationId: string;
  integrationName: string;
};

export type SendPilotSourceIndicator =
  | { show: false }
  | { show: true; label: string; title: string; count: number };

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function mapSendPilotLeadSources(input: {
  identities: Record<string, unknown>[];
  integrations: Record<string, unknown>[];
}): Map<string, SendPilotLeadSource[]> {
  const names = new Map<string, string>();
  for (const row of input.integrations) {
    const id = asText(row.id);
    if (!id) continue;
    names.set(id, asText(row.name) || "Untitled");
  }

  const byLead = new Map<string, SendPilotLeadSource[]>();
  const seen = new Set<string>();
  for (const row of input.identities) {
    const leadId = asText(row.lead_id);
    const integrationId = asText(row.integration_id);
    if (!leadId || !integrationId) continue;
    const name = names.get(integrationId);
    if (!name) continue;
    const key = `${leadId}:${integrationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byLead.get(leadId) ?? [];
    list.push({ leadId, integrationId, integrationName: name });
    byLead.set(leadId, list);
  }

  for (const list of byLead.values()) {
    list.sort(
      (left, right) =>
        left.integrationName.localeCompare(right.integrationName) || left.integrationId.localeCompare(right.integrationId),
    );
  }
  return byLead;
}

export function sendPilotSourceIndicator(sources: SendPilotLeadSource[]): SendPilotSourceIndicator {
  if (sources.length === 0) return { show: false };
  if (sources.length === 1) {
    const source = sources[0]!;
    return {
      show: true,
      label: "SP",
      title: `SendPilot: ${source.integrationName}`,
      count: 1,
    };
  }
  return {
    show: true,
    label: `SP +${sources.length - 1}`,
    title: sources.map((source) => source.integrationName).join(", "),
    count: sources.length,
  };
}

export function sourcesForLead(byLead: Map<string, SendPilotLeadSource[]>, leadId: string) {
  return byLead.get(leadId) ?? [];
}
