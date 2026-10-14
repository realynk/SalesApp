import { classifyWebhookIdentityMatch, type IdentityContact } from "./webhook";

export type MatchSource =
  | "scoped_identity"
  | "legacy_global_id"
  | "scoped_external_id"
  | "email"
  | "linkedin"
  | "contact";

export type LeadIdentityRow = {
  integrationId: string;
  sendpilotLeadId: string;
  leadId: string;
};

export type CandidateLead = {
  leadId: string;
  contactId: string;
  sendpilotLeadId: string | null;
};

export type PossibleSamePersonEvidence = {
  integrationId: string;
  sendpilotLeadId: string | null;
  campaignId: string | null;
  candidateLeadId: string;
  matchedOn: Array<"email" | "linkedin">;
  existingIntegrationIds: string[];
};

export type WebhookMatchDecision =
  | { kind: "existing"; source: MatchSource; contactId: string; leadId: string }
  | { kind: "existing_contact"; source: MatchSource; contactId: string; companyId: string }
  | { kind: "possible_same_person"; evidence: PossibleSamePersonEvidence; reviewReason: string }
  | { kind: "identity_conflict"; candidateLeadId: string; existingSendpilotLeadId: string; reviewReason: string }
  | { kind: "possible_duplicate"; reviewReason: string }
  | { kind: "unmatched" };

export const POSSIBLE_SAME_PERSON = "possible_same_person";
export const IDENTITY_CONFLICT = "identity_conflict";

export const POSSIBLE_SAME_PERSON_REASON =
  "This email or LinkedIn already belongs to a SalesApp lead with a SendPilot identity from another integration.";
export const IDENTITY_CONFLICT_REASON =
  "This SalesApp lead already has a different SendPilot identity for this integration.";

export function planWebhookMatch(input: {
  integrationId: string;
  legacyEnv: boolean;
  sendpilotLeadId: string | null;
  campaignId?: string | null;
  scopedIdentityLead: CandidateLead | null;
  legacyGlobalLead: CandidateLead | null;
  scopedExternalLead: CandidateLead | null;
  foreignExternalLead?: CandidateLead | null;
  linkedinContacts: IdentityContact[];
  emailContacts: IdentityContact[];
  leadByContactId: Record<string, CandidateLead>;
  identitiesByLeadId: Record<string, LeadIdentityRow[]>;
}): WebhookMatchDecision {
  if (input.scopedIdentityLead?.leadId) {
    return {
      kind: "existing",
      source: "scoped_identity",
      contactId: input.scopedIdentityLead.contactId,
      leadId: input.scopedIdentityLead.leadId,
    };
  }

  if (input.legacyEnv && input.legacyGlobalLead?.leadId) {
    return {
      kind: "existing",
      source: "legacy_global_id",
      contactId: input.legacyGlobalLead.contactId,
      leadId: input.legacyGlobalLead.leadId,
    };
  }

  if (input.scopedExternalLead?.leadId) {
    return {
      kind: "existing",
      source: "scoped_external_id",
      contactId: input.scopedExternalLead.contactId,
      leadId: input.scopedExternalLead.leadId,
    };
  }

  void input.foreignExternalLead;
  const identity = classifyWebhookIdentityMatch(input.linkedinContacts, input.emailContacts);
  if (identity.classification === "possible_duplicate") {
    return { kind: "possible_duplicate", reviewReason: identity.reviewReason };
  }
  if (identity.classification === "unmatched") return { kind: "unmatched" };

  const contact = identity.contact;
  const lead = input.leadByContactId[contact.id] ?? null;
  const matchedOn: Array<"email" | "linkedin"> = [];
  if (input.emailContacts.some((row) => row.id === contact.id)) matchedOn.push("email");
  if (input.linkedinContacts.some((row) => row.id === contact.id)) matchedOn.push("linkedin");
  const source: MatchSource = matchedOn.includes("linkedin")
    ? "linkedin"
    : matchedOn.includes("email")
      ? "email"
      : "contact";

  if (!lead) {
    return { kind: "existing_contact", source, contactId: contact.id, companyId: contact.company_id };
  }

  const identities = input.identitiesByLeadId[lead.leadId] ?? [];
  const sameIntegration = identities.find((row) => row.integrationId === input.integrationId);
  const otherIntegrations = identities.filter((row) => row.integrationId !== input.integrationId);

  if (sameIntegration && input.sendpilotLeadId && sameIntegration.sendpilotLeadId !== input.sendpilotLeadId) {
    return {
      kind: "identity_conflict",
      candidateLeadId: lead.leadId,
      existingSendpilotLeadId: sameIntegration.sendpilotLeadId,
      reviewReason: IDENTITY_CONFLICT_REASON,
    };
  }

  if (otherIntegrations.length > 0) {
    return {
      kind: "possible_same_person",
      reviewReason: POSSIBLE_SAME_PERSON_REASON,
      evidence: {
        integrationId: input.integrationId,
        sendpilotLeadId: input.sendpilotLeadId,
        campaignId: input.campaignId ?? null,
        candidateLeadId: lead.leadId,
        matchedOn,
        existingIntegrationIds: [...new Set(otherIntegrations.map((row) => row.integrationId))],
      },
    };
  }

  return { kind: "existing", source, contactId: contact.id, leadId: lead.leadId };
}

export function globalSendpilotLeadIdPatch(input: {
  legacyEnv: boolean;
  existing: string | null | undefined;
  incoming: string | null | undefined;
}) {
  if (!input.legacyEnv) return null;
  const next = input.incoming?.trim() || null;
  const current = input.existing?.trim() || null;
  if (!next || current) return null;
  return next;
}

export function suppressionAppliesToIntegration(input: {
  suppressionIntegrationId: string | null | undefined;
  webhookIntegrationId: string;
  legacyEnv: boolean;
}) {
  const scoped = input.suppressionIntegrationId?.trim() || "";
  if (scoped) return scoped === input.webhookIntegrationId;
  return input.legacyEnv;
}
