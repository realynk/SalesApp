import assert from "node:assert/strict";
import test from "node:test";
import { buildTalentRequestEmail, missingTalentFields } from "./talent-request.ts";

test("talent request does not invent missing client details", () => {
  const drafted = buildTalentRequestEmail({
    companyName: "Harbor & Co.",
    clientName: "Priya Shah",
    headcount: 2,
  });
  assert.match(drafted.body, /Harbor & Co\./);
  assert.match(drafted.body, /Priya Shah/);
  assert.match(drafted.body, /Number of VAs: 2/);
  assert.match(drafted.body, /VA role: \[Not in SalesApp yet\]/);
  assert.ok(drafted.missing.includes("VA role"));
  assert.equal(missingTalentFields({ companyName: "Harbor & Co." }).includes("Client / company"), false);
});

test("complete facts produce no missing list items in the checklist", () => {
  const drafted = buildTalentRequestEmail({
    companyName: "Acme",
    clientName: "Pat",
    role: "EA",
    headcount: 1,
    responsibilities: "Inbox",
    skills: "Calendar",
    schedule: "9-5",
    timezone: "ET",
    budget: "1500",
    experience: "2 years",
    special: "NDA",
    startDate: "2026-11-01",
  });
  assert.deepEqual(drafted.missing, []);
  assert.doesNotMatch(drafted.body, /\[Not in SalesApp yet\]/);
});
