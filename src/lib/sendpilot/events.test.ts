import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeSendPilotEventType,
  extractSendPilotIdentifiers,
  isSupportedSendPilotEvent,
  parseSendPilotEnvelope,
  resolveSendPilotSourceStatus,
} from "./events.ts";
import { parseSendPilotLead } from "./client.ts";

test("canonicalizes SendPilot dashboard and API event names", () => {
  assert.equal(canonicalizeSendPilotEventType("Lead Tag Updated"), "lead.tag.updated");
  assert.equal(canonicalizeSendPilotEventType("lead.tag.updated"), "lead.tag.updated");
  assert.equal(canonicalizeSendPilotEventType("Lead Updated"), "lead.updated");
  assert.equal(canonicalizeSendPilotEventType("lead.status.changed"), "lead.updated");
  assert.equal(canonicalizeSendPilotEventType("Reply Received"), "reply.received");
  assert.equal(canonicalizeSendPilotEventType("message.received"), "reply.received");
  assert.equal(isSupportedSendPilotEvent("lead.tag.updated"), true);
  assert.equal(isSupportedSendPilotEvent("campaign.started"), false);
});

test("maps documented custom statuses without treating campaign replies as journey tags", () => {
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.tag.updated",
      apiCustomLeadStatus: "INTERESTED",
    }),
    { normalized: "Interested", raw: "INTERESTED", applyNormalized: true },
  );
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.updated",
      newStatus: "REPLY_RECEIVED",
    }),
    { normalized: null, raw: "REPLY_RECEIVED", applyNormalized: false },
  );
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.updated",
      newStatus: "MEETING_BOOKED",
    }),
    { normalized: "Meeting Booked", raw: "MEETING_BOOKED", applyNormalized: true },
  );
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.updated",
      newStatus: "NOT_INTERESTED",
    }),
    { normalized: "Not Interested", raw: "NOT_INTERESTED", applyNormalized: true },
  );
  assert.equal(
    resolveSendPilotSourceStatus({
      eventType: "reply.received",
      apiStatus: "REPLY_RECEIVED",
    }).applyNormalized,
    false,
  );
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.tag.updated",
      customLeadStatus: "Interested",
      newTag: "Not Interested",
      tags: ["Not Interested"],
    }),
    { normalized: "Interested", raw: "Interested", applyNormalized: true },
  );
  assert.deepEqual(
    resolveSendPilotSourceStatus({
      eventType: "lead.tag.updated",
      tags: ["Interested"],
    }),
    { normalized: "Interested", raw: "Interested", applyNormalized: true },
  );
});

test("reads documented webhook envelope fields", () => {
  const envelope = parseSendPilotEnvelope({
    eventId: "evt_1",
    eventType: "lead.updated",
    timestamp: "2024-02-24T10:30:00.000Z",
    workspaceId: "ws_1",
    data: {
      leadId: "lead_abc123",
      campaignId: "camp_xyz789",
      linkedinUrl: "https://www.linkedin.com/in/john-doe",
      previousStatus: "REPLY_RECEIVED",
      newStatus: "OPPORTUNITY",
    },
  });
  assert.equal(envelope?.eventId, "evt_1");
  assert.equal(envelope?.eventType, "lead.updated");
  const ids = extractSendPilotIdentifiers(envelope?.data ?? {});
  assert.equal(ids.leadId, "lead_abc123");
  assert.equal(ids.newStatus, "OPPORTUNITY");
  assert.equal(parseSendPilotLead({ id: "lead_abc123", linkedinUrl: "https://linkedin.com/in/a", status: "DONE", campaignId: "camp" })?.id, "lead_abc123");
});
