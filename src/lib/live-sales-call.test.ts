import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_INTERVIEW_MODE,
  INTERVIEW_AVAILABILITY_LABEL,
  joinLiveSalesCallNotes,
  liveSalesCallFieldLabels,
  splitLiveSalesCallNotes,
} from "./live-sales-call.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("candidate interviews are online by default and interview preference is not a field", () => {
  const labels = liveSalesCallFieldLabels();
  assert.equal(labels.interviewMode, "online");
  assert.equal(CANDIDATE_INTERVIEW_MODE, "online");
  assert.equal(labels.interviewPreference, null);
  assert.equal(labels.interviewAvailability, INTERVIEW_AVAILABILITY_LABEL);
});

test("availability round-trips without inventing an online/in-person choice", () => {
  const combined = joinLiveSalesCallNotes("Headcount: 2", "Tue/Thu 2-4pm America/New_York");
  const split = splitLiveSalesCallNotes(combined);
  assert.equal(split.interviewAvailability, "Tue/Thu 2-4pm America/New_York");
  assert.equal(split.notes, "Headcount: 2");
  assert.doesNotMatch(combined, /in-person|interview preference/i);
});

test("missing availability leaves notes unchanged", () => {
  assert.equal(joinLiveSalesCallNotes("Budget approved", "  "), "Budget approved");
  assert.deepEqual(splitLiveSalesCallNotes("Budget approved"), { notes: "Budget approved", interviewAvailability: "" });
});

test("Live Sales Call surfaces capture availability and omit interview preference", () => {
  const dialog = readFileSync(join(root, "src/components/sales-call-complete-dialog.tsx"), "utf8");
  const talent = readFileSync(join(root, "src/lib/talent-request.ts"), "utf8");
  assert.match(dialog, /Candidate Interview Availability/);
  assert.match(dialog, /online by default/);
  assert.doesNotMatch(dialog, /Interview Preference/);
  assert.doesNotMatch(dialog, /in-person/);
  assert.match(talent, /Candidate Interview Availability/);
  assert.doesNotMatch(talent, /Interview Preference/);
});
