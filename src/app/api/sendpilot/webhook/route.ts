import { NextResponse } from "next/server";
import { applySendPilotWebhook } from "@/lib/sendpilot/apply";
import { sendpilotWebhookSecret } from "@/lib/sendpilot/config";
import { verifySendPilotSignature } from "@/lib/sendpilot/signature";

export async function POST(request: Request) {
  const secret = sendpilotWebhookSecret();
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("webhook-signature") ?? request.headers.get("Webhook-Signature");
  const verified = verifySendPilotSignature({
    rawBody,
    signatureHeader,
    secret,
  });

  if (!verified.ok) {
    const status = verified.reason === "missing_secret" ? 503 : 401;
    console.error("[sendpilot.webhook]", { outcome: "rejected", reason: verified.reason });
    return NextResponse.json(
      {
        error:
          verified.reason === "missing_secret"
            ? "SENDPILOT_WEBHOOK_SECRET is not set. Create a webhook in SendPilot and add the secret in Vercel."
            : "Invalid SendPilot webhook signature.",
      },
      { status },
    );
  }

  const result = await applySendPilotWebhook(rawBody);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
