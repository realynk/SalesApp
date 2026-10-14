import type { ActivityType, SendPilotStatus } from "@/lib/domain";

export type IdentityContact = { id: string; company_id: string };

export function classifyWebhookIdentityMatch(
  linkedinContacts: IdentityContact[],
  emailContacts: IdentityContact[],
):
  | { classification: "possible_duplicate"; reviewReason: string }
  | { classification: "contact"; contact: IdentityContact }
  | { classification: "unmatched" } {
  if (linkedinContacts.length > 1 || emailContacts.length > 1) {
    return {
      classification: "possible_duplicate",
      reviewReason: "Multiple contacts share this SendPilot LinkedIn URL or email.",
    };
  }
  if (linkedinContacts.length === 1 && emailContacts.length === 1 && linkedinContacts[0].id !== emailContacts[0].id) {
    return {
      classification: "possible_duplicate",
      reviewReason: "LinkedIn URL and email match different contacts.",
    };
  }
  const contact = linkedinContacts[0] ?? emailContacts[0];
  if (contact) return { classification: "contact", contact };
  return { classification: "unmatched" };
}

export function sendPilotLeadIdForUpdate(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim() || null;
  const current = existing?.trim() || null;
  if (!next) return null;
  if (!current) return next;
  return null;
}

export function webhookLeadUpdate(input: {
  existingSendpilotLeadId: string | null;
  incomingLeadId: string | null;
  status: { normalized: SendPilotStatus | null; raw: string | null; applyNormalized: boolean };
  nowIso: string;
  writeGlobalSendpilotLeadId?: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = { last_synced_at: input.nowIso };
  const nextId =
    input.writeGlobalSendpilotLeadId === false
      ? null
      : sendPilotLeadIdForUpdate(input.existingSendpilotLeadId, input.incomingLeadId);
  if (nextId) patch.sendpilot_lead_id = nextId;
  if (input.status.raw) patch.sendpilot_status_raw = input.status.raw;
  if (input.status.applyNormalized) patch.sendpilot_status = input.status.normalized;
  return patch;
}

export function webhookStatusActivity(input: {
  duplicateEvent: boolean;
  archived: boolean;
  applyNormalized: boolean;
  previousStatus: string | null;
  nextStatus: string | null;
}): Extract<ActivityType, "lead_became_interested" | "sendpilot_status_changed"> | null {
  if (input.duplicateEvent || input.archived) return null;
  if (!input.applyNormalized || !input.nextStatus) return null;
  if (input.nextStatus === input.previousStatus) return null;
  if (input.nextStatus === "Interested" && input.previousStatus !== "Interested") return "lead_became_interested";
  return "sendpilot_status_changed";
}

export function shouldCreateUnmatchedWebhookLead(input: {
  hasExistingLead: boolean;
  possibleDuplicate: boolean;
  suppressed: boolean;
  applyNormalized: boolean;
  normalized: SendPilotStatus | null;
  sendpilotLeadId: string | null;
  email: string | null;
  linkedinUrl: string | null;
}): boolean {
  if (input.hasExistingLead || input.possibleDuplicate || input.suppressed) return false;
  if (!input.applyNormalized) return false;
  if (input.normalized !== "Interested" && input.normalized !== "Not Interested") return false;
  return Boolean(input.sendpilotLeadId?.trim() || input.email?.trim() || input.linkedinUrl?.trim());
}

export function createdWebhookStatusActivity(
  normalized: SendPilotStatus | null,
): Extract<ActivityType, "lead_became_interested" | "sendpilot_status_changed"> | null {
  if (normalized === "Interested") return "lead_became_interested";
  if (normalized === "Not Interested") return "sendpilot_status_changed";
  return null;
}
