import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifySendPilotSignature } from "./signature.ts";

test("verifies SendPilot Webhook-Signature HMAC-SHA256", () => {
  const secret = "whsec_test";
  const rawBody = '{"eventId":"evt_1","eventType":"lead.updated"}';
  const timestamp = "1708456789";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const header = `v1,t=${timestamp},s=${signature}`;
  assert.deepEqual(
    verifySendPilotSignature({ rawBody, signatureHeader: header, secret, nowSeconds: 1708456789 }),
    { ok: true },
  );
});

test("rejects missing, malformed, expired, and mismatched signatures", () => {
  const secret = "whsec_test";
  const rawBody = "{}";
  assert.equal(verifySendPilotSignature({ rawBody, signatureHeader: "v1,t=1,s=abc", secret: "" }).ok, false);
  assert.equal(verifySendPilotSignature({ rawBody, signatureHeader: null, secret }).reason, "missing_header");
  assert.equal(verifySendPilotSignature({ rawBody, signatureHeader: "v1", secret }).reason, "malformed_header");
  const timestamp = "1708456789";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  assert.equal(
    verifySendPilotSignature({
      rawBody,
      signatureHeader: `v1,t=${timestamp},s=${signature}`,
      secret,
      nowSeconds: 1708456789 + 301,
    }).reason,
    "expired_timestamp",
  );
  assert.equal(
    verifySendPilotSignature({
      rawBody,
      signatureHeader: `v1,t=${timestamp},s=${"0".repeat(signature.length)}`,
      secret,
      nowSeconds: 1708456789,
    }).reason,
    "mismatch",
  );
});
