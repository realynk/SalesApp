import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "svix";
import { POST } from "../../app/api/sendpilot/webhook/route.ts";
import { verifySendPilotSignature } from "./signature.ts";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const RAW_BODY = '{"eventId":"evt_1","eventType":"lead.updated"}';
const MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";

function signedHeaders(kind: "svix" | "standard") {
  const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000);
  const signature = new Webhook(SECRET).sign(MSG_ID, timestamp, RAW_BODY);
  const unix = String(Math.floor(timestamp.getTime() / 1000));
  if (kind === "svix") {
    return new Headers({
      "svix-id": MSG_ID,
      "svix-timestamp": unix,
      "svix-signature": signature,
    });
  }
  return new Headers({
    "webhook-id": MSG_ID,
    "webhook-timestamp": unix,
    "webhook-signature": signature,
  });
}

test("accepts a valid Svix signature", () => {
  assert.deepEqual(
    verifySendPilotSignature({ rawBody: RAW_BODY, headers: signedHeaders("svix"), secret: SECRET }),
    { ok: true },
  );
});

test("accepts Standard Webhooks header names as a fallback", () => {
  assert.deepEqual(
    verifySendPilotSignature({
      rawBody: RAW_BODY,
      headers: signedHeaders("standard"),
      secret: SECRET,
    }),
    { ok: true },
  );
});

test("rejects an invalid signature with HTTP 401", () => {
  const headers = signedHeaders("svix");
  headers.set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const verified = verifySendPilotSignature({ rawBody: RAW_BODY, headers, secret: SECRET });
  assert.equal(verified.ok, false);
  if (!verified.ok) {
    assert.equal(verified.status, 401);
    assert.equal(verified.reason, "mismatch");
  }
});

test("rejects missing Svix and Standard Webhooks headers with HTTP 401", () => {
  const verified = verifySendPilotSignature({
    rawBody: RAW_BODY,
    headers: new Headers({ "user-agent": "Svix-Webhooks/rolling" }),
    secret: SECRET,
  });
  assert.equal(verified.ok, false);
  if (!verified.ok) {
    assert.equal(verified.status, 401);
    assert.equal(verified.reason, "missing_header");
  }
});

function signedRequest(headers: HeadersInit) {
  return new Request("http://localhost/api/sendpilot/webhook", {
    method: "POST",
    headers,
    body: RAW_BODY,
  });
}

test("webhook route returns 401 when signature headers are missing", async () => {
  process.env.SENDPILOT_WEBHOOK_SECRET = SECRET;
  const response = await POST(signedRequest({ "user-agent": "Svix-Webhooks/rolling" }));
  assert.equal(response.status, 401);
});

test("webhook route returns 401 for an invalid Svix signature", async () => {
  process.env.SENDPILOT_WEBHOOK_SECRET = SECRET;
  const headers = signedHeaders("svix");
  headers.set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const response = await POST(signedRequest(headers));
  assert.equal(response.status, 401);
});

test("webhook route accepts a valid Svix signature", async () => {
  process.env.SENDPILOT_WEBHOOK_SECRET = SECRET;
  const response = await POST(signedRequest(signedHeaders("svix")));
  assert.notEqual(response.status, 401);
});

test("webhook route accepts Standard Webhooks header names as a fallback", async () => {
  process.env.SENDPILOT_WEBHOOK_SECRET = SECRET;
  const response = await POST(signedRequest(signedHeaders("standard")));
  assert.notEqual(response.status, 401);
});

test("rejects when the webhook secret is missing", () => {
  const verified = verifySendPilotSignature({
    rawBody: RAW_BODY,
    headers: signedHeaders("svix"),
    secret: "",
  });
  assert.equal(verified.ok, false);
  if (!verified.ok) {
    assert.equal(verified.status, 503);
    assert.equal(verified.reason, "missing_secret");
  }
});
