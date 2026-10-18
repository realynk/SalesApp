import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_FIRST_NAME_PLACEHOLDER,
  JOAN_PROFILE_EMAIL_SIGNATURE,
  OUTREACH_FIRST_NAME_PLACEHOLDER,
  PROFILE_EMAIL_CALENDAR_URL,
  PROFILE_EMAIL_CANDIDATES,
  PROFILE_EMAIL_WEBSITE_URL,
  buildSalesProfileEmail,
  clientFirstNameForProfileEmail,
  linkedInOutreachFirstName,
  originalLinkedInOutreachFirstName,
  withProfileEmailSignature,
} from "./profile-email.ts";

test("sales profile email uses the approved SDR template", () => {
  const email = buildSalesProfileEmail({
    clientFirstName: "Wes",
    contactName: 'William "Wes" Seaton',
    outreachFirstName: "Trey",
    companyName: "Workforce Employment Solutions, LLC",
    toEmail: "wes@client.com",
    fromEmail: "joan@realynk.com",
  });
  assert.equal(email.to, "wes@client.com");
  assert.equal(email.from, "joan@realynk.com");
  assert.equal(email.cc, "");
  assert.match(email.subject, /SDR profiles from Realynk Assistants/);
  assert.match(email.body, /^Hi Wes,/);
  assert.match(email.body, /This is Joan from Realynk Assistants\. Trey recently connected with you on LinkedIn\./);
  for (const candidate of PROFILE_EMAIL_CANDIDATES) {
    assert.match(email.body, new RegExp(`\\*\\*${candidate.name}\\*\\*`));
    assert.match(email.body, new RegExp(`\\[View Profile\\]\\(${candidate.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  }
  assert.match(email.body, new RegExp(`\\[our calendar\\]\\(${PROFILE_EMAIL_CALENDAR_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  assert.match(email.body, /hold shortlisted candidates for up to 7 days/);
  assert.match(email.body, /Thank you!/);
  assert.match(email.body, /\n---\n\nBest regards,/);
  assert.match(email.body, /\*\*Joan Baclayon \| Client Success Lead\*\*/);
  assert.match(email.body, new RegExp(`\\[www\\.realynk\\.com\\]\\(${PROFILE_EMAIL_WEBSITE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  assert.match(email.body, /500 4th Street, Albuquerque, NM, 87102/);
  assert.match(email.body, /\*IMPORTANT: The contents of this email and any attachments are confidential/);
  assert.equal((email.body.match(/Joan Baclayon \| Client Success Lead/g) ?? []).length, 1);
  assert.doesNotMatch(email.body, /automatically sent/i);
});

test("signature is appended once even if a draft already includes it", () => {
  const once = withProfileEmailSignature("Thank you!");
  const twice = withProfileEmailSignature(once);
  assert.equal(twice, once);
  assert.equal((twice.match(/Joan Baclayon \| Client Success Lead/g) ?? []).length, 1);
  assert.equal(once.includes(JOAN_PROFILE_EMAIL_SIGNATURE), true);
});

test("missing names stay as editable placeholders and are not invented", () => {
  assert.equal(clientFirstNameForProfileEmail({}), CLIENT_FIRST_NAME_PLACEHOLDER);
  assert.equal(linkedInOutreachFirstName(null), null);
  assert.equal(linkedInOutreachFirstName("Realynk Main"), null);
  assert.equal(linkedInOutreachFirstName("Untitled"), null);
  assert.equal(linkedInOutreachFirstName("Trey"), "Trey");
  assert.equal(originalLinkedInOutreachFirstName([]), null);
  assert.equal(
    originalLinkedInOutreachFirstName([
      { integrationName: "Marcus", firstSeenAt: "2026-01-02T00:00:00Z" },
      { integrationName: "Trey", firstSeenAt: "2026-01-01T00:00:00Z" },
    ]),
    "Trey",
  );
  assert.equal(
    originalLinkedInOutreachFirstName([
      { integrationName: "Marcus", firstSeenAt: null },
      { integrationName: "Trey", firstSeenAt: null },
    ]),
    null,
  );
  const email = buildSalesProfileEmail({ companyName: "Acme" });
  assert.match(email.body, new RegExp(`Hi ${CLIENT_FIRST_NAME_PLACEHOLDER.replace(/[[\]]/g, "\\$&")},`));
  assert.match(email.body, new RegExp(`${OUTREACH_FIRST_NAME_PLACEHOLDER.replace(/[[\]]/g, "\\$&")} recently connected`));
  assert.doesNotMatch(email.body, /^Hi there,/);
});
