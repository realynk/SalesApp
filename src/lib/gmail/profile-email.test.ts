import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_FIRST_NAME_PLACEHOLDER,
  OUTREACH_FIRST_NAME_PLACEHOLDER,
  PROFILE_EMAIL_CALENDAR_URL,
  PROFILE_EMAIL_CANDIDATES,
  buildSalesProfileEmail,
  clientFirstNameForProfileEmail,
  linkedInOutreachFirstName,
  originalLinkedInOutreachFirstName,
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
  assert.match(email.body, /Joan\nRealynk Assistants/);
  assert.doesNotMatch(email.body, /automatically sent/i);
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
