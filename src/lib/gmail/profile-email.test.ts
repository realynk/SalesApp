import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesProfileEmail } from "./profile-email.ts";

test("sales profile email is a reviewable introduction template", () => {
  const email = buildSalesProfileEmail({
    contactName: 'William "Wes" Seaton',
    companyName: "Workforce Employment Solutions, LLC",
    toEmail: "wes@client.com",
    fromEmail: "joan@realynk.com",
    senderName: "Joan",
  });
  assert.equal(email.to, "wes@client.com");
  assert.equal(email.from, "joan@realynk.com");
  assert.equal(email.cc, "");
  assert.match(email.subject, /Workforce Employment Solutions/);
  assert.match(email.body, /^Hi William,/);
  assert.match(email.body, /virtual assistant profiles/);
  assert.match(email.body, /Best,\nJoan/);
  assert.doesNotMatch(email.body, /automatically sent/i);
});
