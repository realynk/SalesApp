import assert from "node:assert/strict";
import test from "node:test";
import { inReportingRange, parseReportingDuration, reportingStartOn } from "./reporting-duration.ts";

test("parses known reporting durations and falls back to all time", () => {
  assert.equal(parseReportingDuration("7d"), "7d");
  assert.equal(parseReportingDuration("30d"), "30d");
  assert.equal(parseReportingDuration("90d"), "90d");
  assert.equal(parseReportingDuration("ytd"), "ytd");
  assert.equal(parseReportingDuration("all"), "all");
  assert.equal(parseReportingDuration(undefined), "all");
  assert.equal(parseReportingDuration("week"), "all");
});

test("computes inclusive start dates for reporting windows", () => {
  assert.equal(reportingStartOn("all", "2026-10-07"), null);
  assert.equal(reportingStartOn("7d", "2026-10-07"), "2026-10-01");
  assert.equal(reportingStartOn("30d", "2026-10-07"), "2026-09-08");
  assert.equal(reportingStartOn("90d", "2026-10-07"), "2026-07-10");
  assert.equal(reportingStartOn("ytd", "2026-10-07"), "2026-01-01");
});

test("keeps rows whose date is on or after the reporting start", () => {
  assert.equal(inReportingRange("2026-10-01T12:00:00.000Z", "2026-10-01"), true);
  assert.equal(inReportingRange("2026-09-30T23:00:00.000Z", "2026-10-01"), false);
  assert.equal(inReportingRange(null, "2026-10-01"), false);
  assert.equal(inReportingRange(null, null), true);
});
