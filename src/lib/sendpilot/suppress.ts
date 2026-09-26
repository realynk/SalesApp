import { normalizeEmail, normalizeLinkedIn } from "../domain";

export type SendPilotIdentity = {
  sendpilotLeadId?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
};

export type SuppressionFingerprint = {
  sendpilotLeadId: string | null;
  emailKey: string | null;
  linkedinKey: string | null;
};

export function suppressionFingerprint(identity: SendPilotIdentity): SuppressionFingerprint {
  return {
    sendpilotLeadId: identity.sendpilotLeadId?.trim() || null,
    emailKey: normalizeEmail(identity.email),
    linkedinKey: normalizeLinkedIn(identity.linkedinUrl),
  };
}

export function identitiesOverlap(left: SendPilotIdentity, right: SendPilotIdentity) {
  const a = suppressionFingerprint(left);
  const b = suppressionFingerprint(right);
  if (a.sendpilotLeadId && b.sendpilotLeadId && a.sendpilotLeadId === b.sendpilotLeadId) return true;
  if (a.emailKey && b.emailKey && a.emailKey === b.emailKey) return true;
  if (a.linkedinKey && b.linkedinKey && a.linkedinKey === b.linkedinKey) return true;
  return false;
}

export function shouldRecreateDeletedLead(input: {
  suppressed: boolean;
  existingLeadId?: string | null;
  archived?: boolean;
}) {
  if (input.existingLeadId) return false;
  if (input.archived) return false;
  if (input.suppressed) return false;
  return true;
}
