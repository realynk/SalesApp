import assert from "node:assert/strict";
import test from "node:test";
import { compactLeadLabel, personAndCompany, personDisplayName, spaciousLeadLabel } from "./lead-display.ts";

test("uses first and last name when both exist", () => {
  assert.equal(personDisplayName({ firstName: "Sarah", lastName: "Johnson", companyName: "ABC Healthcare Solutions" }), "Sarah Johnson");
});

test("uses only the first name when last is missing", () => {
  assert.equal(personDisplayName({ firstName: "Sarah", lastName: "  ", companyName: "Acme" }), "Sarah");
});

test("uses only the last name when first is missing", () => {
  assert.equal(personDisplayName({ firstName: "", lastName: "Johnson", companyName: "Acme" }), "Johnson");
});

test("falls back to an existing full name", () => {
  assert.equal(personDisplayName({ fullName: "Pat Lee", companyName: "Acme" }), "Pat Lee");
});

test("falls back to email when no name exists", () => {
  assert.equal(personDisplayName({ email: "pat@acme.com", companyName: "Acme" }), "pat@acme.com");
});

test("falls back to company when no person identifier exists", () => {
  assert.equal(personDisplayName({ companyName: "Acme Health" }), "Acme Health");
});

test("uses Unnamed lead as the final fallback", () => {
  assert.equal(personDisplayName({ firstName: null, lastName: "", fullName: "Unnamed contact", companyName: "Unknown company" }), "Unnamed lead");
});

test("does not return empty or placeholder strings", () => {
  assert.notEqual(personDisplayName({ firstName: "  ", lastName: null }), "");
  assert.notEqual(personDisplayName({ fullName: "Unnamed lead" }), "");
});

test("two people at the same company keep their own names", () => {
  const acme = { companyName: "Acme" };
  assert.equal(personDisplayName({ ...acme, firstName: "Ada", lastName: "Cole" }), "Ada Cole");
  assert.equal(personDisplayName({ ...acme, firstName: "Ben", lastName: "Cole" }), "Ben Cole");
});

test("opportunity labels use the linked lead, not the opportunity title", () => {
  const fromOpportunityTitle = "Acme — virtual staff";
  const lead = personDisplayName({
    firstName: "Sarah",
    lastName: "Johnson",
    fullName: fromOpportunityTitle,
    companyName: "Acme",
  });
  assert.equal(lead, "Sarah Johnson");
  assert.notEqual(lead, fromOpportunityTitle);
});

test("compact layout is the person only; spacious adds company when it is different", () => {
  const input = { firstName: "Sarah", lastName: "Johnson", companyName: "ABC Healthcare Solutions" };
  assert.equal(compactLeadLabel(input), "Sarah Johnson");
  assert.deepEqual(spaciousLeadLabel(input), { primary: "Sarah Johnson", secondary: "ABC Healthcare Solutions" });
  assert.deepEqual(personAndCompany("Acme Health", "Acme Health"), { primary: "Acme Health", secondary: null });
});
