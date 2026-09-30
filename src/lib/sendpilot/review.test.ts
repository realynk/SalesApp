import assert from "node:assert/strict";
import test from "node:test";
import { importedSendPilotStatus, parseDuplicateTagging, taggingPatch } from "./review.ts";

test("duplicate tagging keeps, replaces, or clears the current SendPilot tag", () => {
  assert.equal(parseDuplicateTagging("keep"), "keep");
  assert.equal(parseDuplicateTagging("nope"), null);
  assert.equal(importedSendPilotStatus("Interested"), "Interested");
  assert.equal(importedSendPilotStatus("unknown-tag"), null);
  assert.equal(taggingPatch("keep", "Interested", "Interested"), null);
  assert.deepEqual(taggingPatch("clear", "Interested", "Interested"), {
    sendpilot_status: null,
    sendpilot_status_raw: null,
    not_interested_outcome: null,
  });
  assert.deepEqual(taggingPatch("replace", "Interested", "Interested"), {
    sendpilot_status: "Interested",
    sendpilot_status_raw: "Interested",
    not_interested_outcome: null,
  });
});
