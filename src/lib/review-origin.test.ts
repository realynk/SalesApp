import assert from "node:assert/strict";
import test from "node:test";
import { bulkReviewEligible, reviewClassificationLabel, reviewRecordOrigin } from "./review-origin.ts";

test("shows file import account, filename, and campaign", () => {
  const origin = reviewRecordOrigin({
    recordSource: "sendpilot",
    syncSource: "csv",
    filename: "october-export.csv",
    integrationName: "Trey",
    campaignId: "cmuvjg",
    campaignName: "SDR Offer",
  });
  assert.equal(origin.channel, "file");
  assert.equal(origin.label, "Trey · file import · october-export.csv · SDR Offer");
});

test("shows webhook account and event without inventing a campaign name", () => {
  const origin = reviewRecordOrigin({
    recordSource: "webhook",
    syncSource: "webhook",
    filename: "lead.tag.updated",
    integrationName: "Trey",
    campaignId: null,
  });
  assert.equal(origin.channel, "webhook");
  assert.equal(origin.label, "Trey · SendPilot webhook · lead.tag.updated");
});

test("falls back when only a filename exists", () => {
  const origin = reviewRecordOrigin({ filename: "leads.xlsx", syncSource: "xlsx" });
  assert.equal(origin.channel, "file");
  assert.equal(origin.label, "file import · leads.xlsx");
});

test("uses short review labels instead of raw classifications", () => {
  assert.equal(reviewClassificationLabel("unmatched"), "No match");
  assert.equal(reviewClassificationLabel("possible_duplicate"), "Possible duplicate");
  assert.equal(reviewClassificationLabel("suppressed"), "Suppressed");
});

test("bulk create skips suppressed and cross-integration holds", () => {
  assert.equal(bulkReviewEligible({ classification: "unmatched" }, "create"), true);
  assert.equal(bulkReviewEligible({ classification: "possible_duplicate" }, "create"), true);
  assert.equal(bulkReviewEligible({ classification: "suppressed" }, "create"), false);
  assert.equal(bulkReviewEligible({ classification: "identity_conflict" }, "create"), false);
  assert.equal(bulkReviewEligible({ classification: "possible_duplicate" }, "apply"), true);
  assert.equal(bulkReviewEligible({ classification: "unmatched" }, "apply"), false);
  assert.equal(bulkReviewEligible({ classification: "unmatched" }, "skip"), true);
});
