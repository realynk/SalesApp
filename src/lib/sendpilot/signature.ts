import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 5 * 60;

export function verifySendPilotSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.secret) return { ok: false, reason: "missing_secret" };
  if (!input.signatureHeader) return { ok: false, reason: "missing_header" };

  const parts = input.signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const provided = parts.find((part) => part.startsWith("s="))?.slice(2);
  if (!timestamp || !provided) return { ok: false, reason: "malformed_header" };

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "invalid_timestamp" };

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "expired_timestamp" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  try {
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) return { ok: false, reason: "mismatch" };
    if (!timingSafeEqual(providedBuffer, expectedBuffer)) return { ok: false, reason: "mismatch" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "mismatch" };
  }
}
