import assert from "node:assert/strict";
import test from "node:test";
import { startMeetingNotes } from "./google-meet-notes.ts";

test("does not start AI notes until the user asks", () => {
  const result = startMeetingNotes({
    userRequested: false,
    recordingAvailable: true,
    permissionGranted: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /only when you ask/i);
});

test("missing recordings stay manual", () => {
  const result = startMeetingNotes({
    userRequested: true,
    recordingAvailable: false,
    permissionGranted: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /No Google Meet recording/i);
    assert.equal(result.allowManual, true);
  }
});

test("denied Google permissions stay manual", () => {
  const result = startMeetingNotes({
    userRequested: true,
    recordingAvailable: true,
    permissionGranted: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not authorized/i);
});

test("AI processing failure lets the user continue manually", () => {
  const result = startMeetingNotes({
    userRequested: true,
    recordingAvailable: true,
    permissionGranted: true,
    processingFailed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /could not be generated/i);
    assert.equal(result.allowManual, true);
  }
});
