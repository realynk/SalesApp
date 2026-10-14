import { Webhook } from "svix";

export function sendPilotSignatureHeaders(headers: Headers) {
  return {
    id: headers.get("svix-id") ?? headers.get("webhook-id"),
    timestamp: headers.get("svix-timestamp") ?? headers.get("webhook-timestamp"),
    signature: headers.get("svix-signature") ?? headers.get("webhook-signature"),
  };
}

export function verifySendPilotSignature(input: {
  rawBody: string;
  headers: Headers;
  secret: string;
}): { ok: true } | { ok: false; reason: string; status: 401 | 503 } {
  if (!input.secret) return { ok: false, reason: "missing_secret", status: 503 };

  const { id, timestamp, signature } = sendPilotSignatureHeaders(input.headers);
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_header", status: 401 };
  }

  try {
    new Webhook(input.secret).verify(input.rawBody, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "mismatch", status: 401 };
  }
}
