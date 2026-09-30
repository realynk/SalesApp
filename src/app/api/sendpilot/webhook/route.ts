import { NextResponse } from "next/server";
import { applySendPilotWebhook } from "@/lib/sendpilot/apply";
import { sendpilotWebhookSecret } from "@/lib/sendpilot/config";
import { verifySendPilotSignature } from "@/lib/sendpilot/signature";

export async function POST(request: Request) {
  const secret = sendpilotWebhookSecret();
  const rawBody = await request.text();
  const verified = verifySendPilotSignature({
    rawBody,
    headers: request.headers,
    secret,
  });

  if (!verified.ok) {
    console.error("[sendpilot.webhook]", { outcome: "rejected", reason: verified.reason });
    return NextResponse.json(
      {
        error:
          verified.reason === "missing_secret"
            ? "SENDPILOT_WEBHOOK_SECRET is not set. Create a webhook in SendPilot and add the secret in Vercel."
            : "Invalid SendPilot webhook signature.",
      },
      { status: verified.status },
    );
  }

  const result = await applySendPilotWebhook(rawBody);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
