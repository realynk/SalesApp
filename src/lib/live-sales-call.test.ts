import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_INTERVIEW_MODE,
  INTERVIEW_AVAILABILITY_LABEL,
  draftStatusForLiveSalesCall,
  joinLiveSalesCallNotes,
  liveSalesCallFieldLabels,
  liveSalesCallIsComplete,
  liveSalesCallValuesFromRow,
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
  const form = readFileSync(join(root, "src/components/live-sales-call-form.tsx"), "utf8");
  const talent = readFileSync(join(root, "src/lib/talent-request.ts"), "utf8");
  assert.match(dialog, /Candidate Interview Availability/);
  assert.match(dialog, /Loading saved call/);
  assert.match(dialog, /online by default/);
  assert.doesNotMatch(dialog, /Interview Preference/);
  assert.doesNotMatch(dialog, /in-person/);
  assert.match(form, /Save draft/);
  assert.match(form, /Saving draft/);
  assert.match(form, /Loading saved call/);
  assert.match(form, /Mark sales call complete/);
  assert.match(form, /INTERVIEW_AVAILABILITY_LABEL/);
  assert.match(form, /Preferred dates, times, and timezone/);
  assert.doesNotMatch(form, /Interview Preference/);
  assert.match(talent, /Candidate Interview Availability/);
  assert.doesNotMatch(talent, /Interview Preference/);
});

test("draft save keeps Scheduled or Draft and never marks the call complete", () => {
  assert.equal(draftStatusForLiveSalesCall(null), "Draft");
  assert.equal(draftStatusForLiveSalesCall("Draft"), "Draft");
  assert.equal(draftStatusForLiveSalesCall("Scheduled"), "Scheduled");
  assert.equal(draftStatusForLiveSalesCall("Complete"), "Complete");
  assert.equal(liveSalesCallIsComplete("Draft"), false);
  assert.equal(liveSalesCallIsComplete("Scheduled"), false);
  assert.equal(liveSalesCallIsComplete("Complete"), true);
});

test("saved strategy-call rows reload the linked person requirements and availability", () => {
  const values = liveSalesCallValuesFromRow({
    status: "Scheduled",
    preferred_virtual_staff: "EA",
    headcount_requirement: 2,
    notes: "Candidate Interview Availability:\nTue 2pm ET\n\nNeeds inbox coverage",
    timezone: "ET",
  });
  assert.equal(values.role, "EA");
  assert.equal(values.headcount, "2");
  assert.equal(values.interviewAvailability, "Tue 2pm ET");
  assert.equal(values.notes, "Needs inbox coverage");
  assert.equal(values.status, "Scheduled");
});

test("draft save action does not move the pipeline or run complete-call automation", () => {
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const draftFn = actions.slice(actions.indexOf("export async function saveLiveSalesCallDraft"));
  const body = draftFn.slice(0, draftFn.indexOf("\nexport async function "));
  assert.match(body, /requireWriter/);
  assert.match(body, /draftStatusForLiveSalesCall/);
  assert.doesNotMatch(body, /moveStage/);
  assert.doesNotMatch(body, /planSalesCallCompleteTasks/);
  assert.doesNotMatch(body, /SALES_CALL_COMPLETE_STAGE/);
  assert.doesNotMatch(body, /planBookedCallTasks/);
  assert.match(actions, /export async function loadLiveSalesCall[\s\S]*?requireUser/);
});
