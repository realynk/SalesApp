import assert from "node:assert/strict";
import test from "node:test";
import { buildGmailRawMessage, looksLikeEmail, parseAddressList } from "./mime.ts";

test("CC and To split on commas", () => {
  assert.deepEqual(parseAddressList("a@x.com, b@y.com"), ["a@x.com", "b@y.com"]);
  assert.equal(looksLikeEmail("a@x.com"), true);
  assert.equal(looksLikeEmail("not-an-email"), false);
});

test("raw Gmail payload includes edited headers and does not send without them", () => {
  const raw = buildGmailRawMessage({
    from: "joan@realynk.com",
    to: "wes@client.com",
    cc: "lead@client.com",
    subject: "Realynk Assistants introduction",
    body: "Hi William,\n\nPlease review these profiles.",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const [, encodedBody = ""] = decoded.split("\r\n\r\n");
  const body = Buffer.from(encodedBody.trim(), "base64").toString("utf8");
  assert.match(decoded, /From: joan@realynk.com/);
  assert.match(decoded, /To: wes@client.com/);
  assert.match(decoded, /Cc: lead@client.com/);
  assert.match(decoded, /Subject: Realynk Assistants introduction/);
  assert.match(body, /Please review these profiles/);
  assert.throws(() => buildGmailRawMessage({ from: "bad", to: "also-bad", subject: "x", body: "y" }));
});
