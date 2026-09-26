import { normalizeSendPilotStatus, type SendPilotStatus } from "../domain";

export const SUPPORTED_SENDPILOT_EVENTS = [
  "lead.tag.updated",
  "lead.updated",
  "reply.received",
] as const;

export type SupportedSendPilotEvent = (typeof SUPPORTED_SENDPILOT_EVENTS)[number];

const EVENT_ALIASES: Record<string, SupportedSendPilotEvent> = {
  "lead.tag.updated": "lead.tag.updated",
  "lead tag updated": "lead.tag.updated",
  "lead.updated": "lead.updated",
  "lead updated": "lead.updated",
  "lead.status.changed": "lead.updated",
  "reply.received": "reply.received",
  "reply received": "reply.received",
  "message.received": "reply.received",
};

export function canonicalizeSendPilotEventType(value: string | null | undefined): string {
  if (!value) return "";
  const cleaned = value.trim().toLowerCase().replace(/[_-]+/g, ".").replace(/\s+/g, " ");
  const spaced = value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  return EVENT_ALIASES[cleaned] ?? EVENT_ALIASES[spaced] ?? value.trim();
}

export function isSupportedSendPilotEvent(value: string): value is SupportedSendPilotEvent {
  return (SUPPORTED_SENDPILOT_EVENTS as readonly string[]).includes(value);
}

function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function parseTags(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "name" in item && typeof item.name === "string") return item.name.trim();
      return "";
    })
    .filter(Boolean);
}

export type SendPilotWebhookIdentifiers = {
  leadId: string | null;
  campaignId: string | null;
  linkedinUrl: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  customLeadStatus: string | null;
  newStatus: string | null;
  previousStatus: string | null;
  reply: string | null;
  tags: string[];
};

export function extractSendPilotIdentifiers(data: Record<string, unknown>): SendPilotWebhookIdentifiers {
  return {
    leadId: stringField(data, "leadId"),
    campaignId: stringField(data, "campaignId"),
    linkedinUrl: stringField(data, "linkedinUrl"),
    email: stringField(data, "email"),
    firstName: stringField(data, "firstName"),
    lastName: stringField(data, "lastName"),
    company: stringField(data, "company"),
    title: stringField(data, "title"),
    customLeadStatus: stringField(data, "customLeadStatus"),
    newStatus: stringField(data, "newStatus"),
    previousStatus: stringField(data, "previousStatus"),
    reply: stringField(data, "reply"),
    tags: parseTags(data.tags),
  };
}

export function parseSendPilotEnvelope(payload: unknown): {
  eventId: string | null;
  eventType: string;
  timestamp: string | null;
  workspaceId: string | null;
  data: Record<string, unknown>;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const eventType = canonicalizeSendPilotEventType(stringField(record, "eventType"));
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  return {
    eventId: stringField(record, "eventId"),
    eventType,
    timestamp: stringField(record, "timestamp"),
    workspaceId: stringField(record, "workspaceId"),
    data,
  };
}

export function resolveSendPilotSourceStatus(input: {
  eventType: string;
  customLeadStatus?: string | null;
  tags?: string[];
  newStatus?: string | null;
  apiCustomLeadStatus?: string | null;
  apiStatus?: string | null;
}): { normalized: SendPilotStatus | null; raw: string | null; applyNormalized: boolean } {
  const tagStatus = [...(input.tags ?? [])].reverse().find((tag) => normalizeSendPilotStatus(tag)) ?? null;
  const tagRaw = input.tags?.length ? input.tags.join(", ") : null;
  const preferred = input.customLeadStatus || input.apiCustomLeadStatus || tagStatus || null;

  if (input.eventType === "lead.tag.updated") {
    const raw = preferred || tagRaw;
    return {
      normalized: normalizeSendPilotStatus(preferred),
      raw,
      applyNormalized: Boolean(preferred || tagRaw),
    };
  }

  if (input.eventType === "lead.updated") {
    const fromNew = normalizeSendPilotStatus(input.newStatus);
    const fromPreferred = normalizeSendPilotStatus(preferred);
    const normalized = fromPreferred ?? fromNew;
    const raw = preferred || input.newStatus || input.apiStatus || null;
    return {
      normalized,
      raw,
      applyNormalized: Boolean(fromPreferred || fromNew),
    };
  }

  return {
    normalized: normalizeSendPilotStatus(preferred),
    raw: preferred || input.apiStatus || null,
    applyNormalized: false,
  };
}
