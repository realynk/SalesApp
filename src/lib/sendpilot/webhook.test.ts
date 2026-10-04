import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSendPilotIdentifiers,
  resolveSendPilotSourceStatus,
} from "./events.ts";
import {
  classifyWebhookIdentityMatch,
  sendPilotLeadIdForUpdate,
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
