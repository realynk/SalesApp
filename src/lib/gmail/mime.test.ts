import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesProfileEmail } from "./profile-email.ts";
import { buildGmailRawMessage, looksLikeEmail, parseAddressList, profileEmailHtmlBody } from "./mime.ts";

test("CC and To split on commas", () => {
  assert.deepEqual(parseAddressList("a@x.com, b@y.com"), ["a@x.com", "b@y.com"]);
  assert.equal(looksLikeEmail("a@x.com"), true);
  assert.equal(looksLikeEmail("not-an-email"), false);
});

test("raw Gmail payload includes edited headers and clickable HTML links", () => {
  const raw = buildGmailRawMessage({
    from: "joan@realynk.com",
    to: "wes@client.com",
    cc: "lead@client.com",
    subject: "SDR profiles from Realynk Assistants",
    body: "Hi Wes,\n\n1. **Thea** – [View Profile](https://jobcentra.com/thea-sungcal-portfolio)\n\nBook [our calendar](https://realynk.com/realynk-outbound).",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /From: joan@realynk.com/);
  assert.match(decoded, /To: wes@client.com/);
  assert.match(decoded, /Cc: lead@client.com/);
  assert.match(decoded, /Subject: SDR profiles from Realynk Assistants/);
  assert.match(decoded, /multipart\/alternative/);
  function decodePart(type: string) {
    const marker = `Content-Type: ${type}; charset=UTF-8`;
    const rest = decoded.slice(decoded.indexOf(marker));
    const start = rest.indexOf("\r\n\r\n") + 4;
    const end = rest.indexOf("\r\n--", start);
    return Buffer.from(rest.slice(start, end).trim(), "base64").toString("utf8");
  }
  const htmlBody = decodePart("text/html");
  const plainBody = decodePart("text/plain");
  assert.match(htmlBody, /<a href="https:\/\/jobcentra.com\/thea-sungcal-portfolio">View Profile<\/a>/);
  assert.match(htmlBody, /<a href="https:\/\/realynk.com\/realynk-outbound">our calendar<\/a>/);
  assert.match(htmlBody, /<strong>Thea<\/strong>/);
  assert.match(plainBody, /https:\/\/jobcentra.com\/thea-sungcal-portfolio/);
  assert.throws(() => buildGmailRawMessage({ from: "bad", to: "also-bad", subject: "x", body: "y" }));
});

test("HTML conversion keeps one signature with bold, italic, divider, and website link", () => {
  const email = buildSalesProfileEmail({ clientFirstName: "Wes", outreachFirstName: "Trey" });
  const html = profileEmailHtmlBody(email.body);
  const again = profileEmailHtmlBody(email.body);
  assert.equal(again, html);
  assert.equal((html.match(/Joan Baclayon \| Client Success Lead/g) ?? []).length, 1);
  assert.match(html, /<hr>/);
  assert.match(html, /<strong>Joan Baclayon \| Client Success Lead<\/strong>/);
  assert.match(html, /<a href="https:\/\/www\.realynk\.com\/">www\.realynk\.com<\/a>/);
  assert.match(html, /<em>IMPORTANT:/);
  assert.doesNotMatch(html, /<hr>\s*<hr>/);
});
