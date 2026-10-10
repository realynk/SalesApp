import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  addCalendarDays,
  daysBetweenCivil,
  isWeekend,
  previousFridayIfWeekend,
  todayInWorkflowZone,
  weekdayUtc,
} from "./workflow-dates.ts";

test("calendar days include weekends and do not use 24-hour UTC jumps", () => {
  assert.equal(addCalendarDays("2026-10-16", 1), "2026-10-17");
  assert.equal(addCalendarDays("2026-10-16", 3), "2026-10-19");
  assert.equal(isWeekend("2026-10-17"), true);
  assert.equal(isWeekend("2026-10-16"), false);
  assert.equal(daysBetweenCivil("2026-10-16", "2026-10-20"), 4);
});

test("business days skip Saturday and Sunday only", () => {
  assert.equal(addBusinessDays("2026-10-16", 3), "2026-10-21");
  assert.equal(addBusinessDays("2026-10-16", 5), "2026-10-23");
  assert.equal(addBusinessDays("2026-10-16", 7), "2026-10-27");
  assert.equal(addBusinessDays("2026-10-16", 10), "2026-10-30");
});

test("US public holidays still count as business days", () => {
  assert.equal(addBusinessDays("2026-11-25", 1), "2026-11-26");
  assert.equal(addBusinessDays("2026-12-24", 1), "2026-12-25");
});

test("SOW reminder that lands on a weekend moves to the preceding Friday", () => {
  assert.equal(previousFridayIfWeekend(addCalendarDays("2026-10-20", -3)), "2026-10-16");
  assert.equal(previousFridayIfWeekend("2026-10-16"), "2026-10-16");
});

test("America/New_York daylight-saving spring-forward does not skip a civil day", () => {
  assert.equal(addCalendarDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addBusinessDays("2026-03-06", 1), "2026-03-09");
  assert.equal(weekdayUtc("2026-03-08"), 0);
});

test("America/New_York daylight-saving fall-back does not duplicate a civil day", () => {
  assert.equal(addCalendarDays("2026-11-01", 1), "2026-11-02");
  assert.equal(addBusinessDays("2026-10-30", 1), "2026-11-02");
});

test("today in the workflow zone is a YYYY-MM-DD civil date", () => {
  assert.match(todayInWorkflowZone(new Date("2026-03-08T06:30:00.000Z")), /^\d{4}-\d{2}-\d{2}$/);
});
