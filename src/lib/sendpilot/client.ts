import { sendpilotApiBaseUrl, sendpilotApiKey } from "./config";

export class SendPilotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SendPilotApiError";
  }
}

export type SendPilotApiAuth = {
  apiKey: string;
};

export type SendPilotLead = {
  id: string;
  linkedinUrl: string | null;
  status: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  campaignId: string | null;
  customLeadStatus: string | null;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

export function resolveSendPilotApiAuth(input: {
  integrationApiKey?: string | null;
  allowLegacyEnvFallback: boolean;
}): SendPilotApiAuth | null {
  const fromIntegration = input.integrationApiKey?.trim() || "";
  if (fromIntegration) return { apiKey: fromIntegration };
  if (input.allowLegacyEnvFallback) {
    const fallback = sendpilotApiKey();
    if (fallback) return { apiKey: fallback };
  }
  return null;
}

export function parseSendPilotLead(value: unknown): SendPilotLead | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id);
  if (!id) return null;
  return {
    id,
    linkedinUrl: stringValue(record.linkedinUrl),
    status: stringValue(record.status),
    firstName: stringValue(record.firstName),
    lastName: stringValue(record.lastName),
    title: stringValue(record.title),
    company: stringValue(record.company),
    campaignId: stringValue(record.campaignId),
    customLeadStatus: stringValue(record.customLeadStatus),
    email: stringValue(record.email),
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
  };
}

function mergeLeads(primary: SendPilotLead, extra: SendPilotLead | null): SendPilotLead {
  if (!extra) return primary;
  return {
    id: primary.id,
    linkedinUrl: primary.linkedinUrl || extra.linkedinUrl,
    status: extra.status || primary.status,
    firstName: primary.firstName || extra.firstName,
    lastName: primary.lastName || extra.lastName,
    title: primary.title || extra.title,
    company: primary.company || extra.company,
    campaignId: primary.campaignId || extra.campaignId,
    customLeadStatus: primary.customLeadStatus || extra.customLeadStatus,
    email: primary.email || extra.email,
    createdAt: primary.createdAt || extra.createdAt,
    updatedAt: extra.updatedAt || primary.updatedAt,
  };
}

async function sendpilotFetch(path: string, auth: SendPilotApiAuth): Promise<unknown> {
  const base = sendpilotApiBaseUrl();
  const key = auth.apiKey.trim();
  if (!base || !key) {
    throw new SendPilotApiError("SendPilot API is not configured.", 503);
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": key,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const code = body && typeof body === "object" && "code" in body ? String((body as { code?: unknown }).code ?? "") : "";
    throw new SendPilotApiError(
      `SendPilot API request failed (${response.status}${code ? ` ${code}` : ""}).`,
      response.status,
    );
  }
  return body;
}

export async function getSendPilotLeadById(leadId: string, auth: SendPilotApiAuth): Promise<SendPilotLead | null> {
  const body = await sendpilotFetch(`/leads/${encodeURIComponent(leadId)}`, auth);
  return parseSendPilotLead(body);
}

export async function findSendPilotLeadInCampaign(
  campaignId: string,
  leadId: string,
  auth: SendPilotApiAuth,
): Promise<SendPilotLead | null> {
  for (let page = 1; page <= 5; page += 1) {
    const params = new URLSearchParams({
      campaignId,
      full: "true",
      page: String(page),
      limit: "100",
    });
    const body = await sendpilotFetch(`/leads?${params.toString()}`, auth);
    const leads = body && typeof body === "object" && Array.isArray((body as { leads?: unknown }).leads)
      ? (body as { leads: unknown[] }).leads
      : [];
    const match = leads.map(parseSendPilotLead).find((lead) => lead?.id === leadId) ?? null;
    if (match) return match;
    const pagination = body && typeof body === "object" ? (body as { pagination?: { totalPages?: unknown } }).pagination : null;
    const totalPages = typeof pagination?.totalPages === "number" ? pagination.totalPages : page;
    if (page >= totalPages || leads.length === 0) break;
  }
  return null;
}

export async function loadSendPilotLead(
  leadId: string,
  campaignId: string | null | undefined,
  auth: SendPilotApiAuth | null,
): Promise<SendPilotLead | null> {
  if (!auth?.apiKey.trim() || !sendpilotApiBaseUrl()) return null;
  const lead = await getSendPilotLeadById(leadId, auth);
  if (!lead) return null;
  if (lead.customLeadStatus && lead.email) return lead;
  const campaign = campaignId || lead.campaignId;
  if (!campaign) return lead;
  try {
    const detailed = await findSendPilotLeadInCampaign(campaign, leadId, auth);
    return mergeLeads(lead, detailed);
  } catch (error) {
    console.error("[sendpilot.api]", {
      action: "list_leads",
      campaignPresent: Boolean(campaign),
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return lead;
  }
}
