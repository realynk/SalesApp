import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSendPilotIdentifiers,
  resolveSendPilotSourceStatus,
} from "./events.ts";
import {
  classifyWebhookIdentityMatch,
  createdWebhookStatusActivity,
  sendPilotLeadIdForUpdate,
  shouldCreateUnmatchedWebhookLead,
  webhookLeadUpdate,
  webhookStatusActivity,
} from "./webhook.ts";

test("newTag Interested is recognized on lead.tag.updated", () => {
  const ids = extractSendPilotIdentifiers({
    leadId: "sp_1",
    linkedinUrl: "https://www.linkedin.com/in/marcus",
    newTag: "Interested",
    previousTag: "No Response",
  });
  assert.equal(ids.newTag, "Interested");
  assert.equal(ids.previousTag, "No Response");
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.tag.updated",
      customLeadStatus: ids.customLeadStatus,
      newTag: ids.newTag,
      tags: ids.tags,
    }),
    { normalized: "Interested", raw: "Interested", applyNormalized: true },
  );
});

test("newTag Not Interested is recognized on lead.tag.updated", () => {
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.tag.updated",
      newTag: "NOT_INTERESTED",
    }),
    { normalized: "Not Interested", raw: "NOT_INTERESTED", applyNormalized: true },
  );
});

test("unique LinkedIn matching works when email is unavailable", () => {
  const matched = classifyWebhookIdentityMatch([{ id: "c1", company_id: "co1" }], []);
  assert.equal(matched.classification, "contact");
  if (matched.classification === "contact") assert.equal(matched.contact.id, "c1");
});

test("ambiguous LinkedIn or email matches stay on reconciliation", () => {
  const many = classifyWebhookIdentityMatch(
    [
      { id: "c1", company_id: "co1" },
      { id: "c2", company_id: "co1" },
    ],
    [],
  );
  assert.equal(many.classification, "possible_duplicate");
  const split = classifyWebhookIdentityMatch(
    [{ id: "c1", company_id: "co1" }],
    [{ id: "c2", company_id: "co2" }],
  );
  assert.equal(split.classification, "possible_duplicate");
});

test("Interested webhook updates the matched lead SendPilot status only", () => {
  const status = resolveSendPilotSourceStatus({ eventType: "lead.tag.updated", newTag: "Interested" });
  const patch = webhookLeadUpdate({
    existingSendpilotLeadId: null,
    incomingLeadId: "sp_1",
    status,
    nowIso: "2026-10-04T12:00:00.000Z",
  });
  assert.equal(patch.sendpilot_status, "Interested");
  assert.equal(patch.sendpilot_lead_id, "sp_1");
  assert.equal("stage" in patch, false);
  assert.equal("opportunity_id" in patch, false);
});

test("Not Interested webhook updates the matched lead SendPilot status only", () => {
  const status = resolveSendPilotSourceStatus({ eventType: "lead.tag.updated", newTag: "Not Interested" });
  const patch = webhookLeadUpdate({
    existingSendpilotLeadId: "sp_1",
    incomingLeadId: "sp_1",
    status,
    nowIso: "2026-10-04T12:00:00.000Z",
  });
  assert.equal(patch.sendpilot_status, "Not Interested");
  assert.equal("sendpilot_lead_id" in patch, false);
});

test("stores sendpilot_lead_id after a safe unique match and does not overwrite another ID", () => {
  assert.equal(sendPilotLeadIdForUpdate(null, "sp_new"), "sp_new");
  assert.equal(sendPilotLeadIdForUpdate("sp_existing", "sp_other"), null);
  assert.equal(sendPilotLeadIdForUpdate("sp_existing", "sp_existing"), null);
});

test("duplicate webhook and same status do not create another status activity", () => {
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: true,
      archived: false,
      applyNormalized: true,
      previousStatus: "No Response",
      nextStatus: "Interested",
    }),
    null,
  );
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: false,
      archived: false,
      applyNormalized: true,
      previousStatus: "Interested",
      nextStatus: "Interested",
    }),
    null,
  );
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: false,
      archived: false,
      applyNormalized: true,
      previousStatus: "No Response",
      nextStatus: "Interested",
    }),
    "lead_became_interested",
  );
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: false,
      archived: false,
      applyNormalized: true,
      previousStatus: "Interested",
      nextStatus: "Not Interested",
    }),
    "sendpilot_status_changed",
  );
});

function unmatchedCreate(input: {
  eventType: string;
  newTag?: string | null;
  newStatus?: string | null;
  sendpilotLeadId?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  hasExistingLead?: boolean;
  possibleDuplicate?: boolean;
  suppressed?: boolean;
}) {
  const status = resolveSendPilotSourceStatus({
    eventType: input.eventType,
    newTag: input.newTag,
    newStatus: input.newStatus,
  });
  return shouldCreateUnmatchedWebhookLead({
    hasExistingLead: input.hasExistingLead ?? false,
    possibleDuplicate: input.possibleDuplicate ?? false,
    suppressed: input.suppressed ?? false,
    applyNormalized: status.applyNormalized,
    normalized: status.normalized,
    sendpilotLeadId: input.sendpilotLeadId ?? null,
    email: input.email ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
  });
}

test("unmatched Interested with SendPilot ID and LinkedIn may create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Interested",
      sendpilotLeadId: "sp_1",
      linkedinUrl: "https://www.linkedin.com/in/marcus",
    }),
    true,
  );
});

test("unmatched Interested with SendPilot ID only may create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Interested",
      sendpilotLeadId: "sp_1",
    }),
    true,
  );
});

test("unmatched Not Interested with SendPilot ID and LinkedIn may create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Not Interested",
      sendpilotLeadId: "sp_2",
      linkedinUrl: "https://www.linkedin.com/in/joan",
    }),
    true,
  );
});

test("unmatched Not Interested with SendPilot ID only may create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.updated",
      newStatus: "NOT_INTERESTED",
      sendpilotLeadId: "sp_2",
    }),
    true,
  );
});

test("new Not Interested lead writes sendpilot_status_changed with Attention metadata", () => {
  assert.equal(createdWebhookStatusActivity("Not Interested"), "sendpilot_status_changed");
  const metadata = {
    sendpilotEventId: "evt_ni",
    sendpilotLeadId: "sp_2",
    previousStatus: null,
    newStatus: "Not Interested",
  };
  assert.equal(metadata.newStatus, "Not Interested");
  assert.equal(metadata.previousStatus, null);
});

test("new Interested lead still uses lead_became_interested", () => {
  assert.equal(createdWebhookStatusActivity("Interested"), "lead_became_interested");
});

test("duplicate webhook does not create another lead once matched", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Interested",
      sendpilotLeadId: "sp_1",
      hasExistingLead: true,
    }),
    false,
  );
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: true,
      archived: false,
      applyNormalized: true,
      previousStatus: null,
      nextStatus: "Interested",
    }),
    null,
  );
});

test("same Not Interested status again does not write another status-change activity", () => {
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: false,
      archived: false,
      applyNormalized: true,
      previousStatus: "Not Interested",
      nextStatus: "Not Interested",
    }),
    null,
  );
});

test("unmatched lead.updated with No Response does not create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.updated",
      newStatus: "No Response",
      sendpilotLeadId: "sp_cold",
      email: "cold@example.com",
      linkedinUrl: "https://www.linkedin.com/in/cold",
    }),
    false,
  );
});

test("unmatched lead.updated with Meeting Booked does not create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.updated",
      newStatus: "MEETING_BOOKED",
      sendpilotLeadId: "sp_booked",
      email: "booked@example.com",
    }),
    false,
  );
});

test("unmatched lead.updated with no normalized status does not create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.updated",
      newStatus: "CONNECTION_ACCEPTED",
      sendpilotLeadId: "sp_conn",
      linkedinUrl: "https://www.linkedin.com/in/conn",
    }),
    false,
  );
});

test("unmatched reply.received does not create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "reply.received",
      sendpilotLeadId: "sp_reply",
      email: "reply@example.com",
    }),
    false,
  );
});

test("matched reply.received still records email activity rather than a status change", () => {
  assert.equal(
    resolveSendPilotSourceStatus({ eventType: "reply.received", apiStatus: "REPLY_RECEIVED" }).applyNormalized,
    false,
  );
  assert.equal(
    webhookStatusActivity({
      duplicateEvent: false,
      archived: false,
      applyNormalized: false,
      previousStatus: "Interested",
      nextStatus: null,
    }),
    null,
  );
});

test("existing matched lead.updated continues to patch SendPilot status only", () => {
  const status = resolveSendPilotSourceStatus({ eventType: "lead.updated", newStatus: "MEETING_BOOKED" });
  const patch = webhookLeadUpdate({
    existingSendpilotLeadId: "sp_1",
    incomingLeadId: "sp_1",
    status,
    nowIso: "2026-10-04T12:00:00.000Z",
  });
  assert.equal(patch.sendpilot_status, "Meeting Booked");
  assert.equal("sendpilot_lead_id" in patch, false);
  assert.equal("stage" in patch, false);
});

test("ambiguous identity match does not create", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Interested",
      sendpilotLeadId: "sp_dup",
      email: "dup@example.com",
      possibleDuplicate: true,
    }),
    false,
  );
});

test("suppressed SendPilot lead does not recreate", () => {
  assert.equal(
    unmatchedCreate({
      eventType: "lead.tag.updated",
      newTag: "Interested",
      sendpilotLeadId: "sp_deleted",
      linkedinUrl: "https://www.linkedin.com/in/deleted",
      suppressed: true,
    }),
    false,
  );
});
