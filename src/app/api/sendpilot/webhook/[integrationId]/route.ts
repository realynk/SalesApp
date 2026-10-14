import { NextResponse } from "next/server";
import { parseLegacySendPilotIntegration } from "@/lib/sendpilot/integration";
import { handleDynamicSendPilotWebhook } from "@/lib/sendpilot/webhook-dispatch";
import { createAdminClient, supabaseServiceRoleKey } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await context.params;
  const rawBody = await request.text();

  if (!supabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: "SendPilot webhook verification is not configured." },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  const result = await handleDynamicSendPilotWebhook({
    integrationId,
    rawBody,
    headers: request.headers,
    loaders: {
      async loadIntegration(id) {
        const { data, error } = await supabase
          .from("sendpilot_integrations")
          .select("id, name, workspace_id, status, tracking_mode, legacy_env")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return parseLegacySendPilotIntegration(data);
      },
      async loadCredentialCiphertexts(id) {
        const { data, error } = await supabase.rpc("sendpilot_load_integration_credentials", {
          p_integration_id: id,
        });
        if (error) throw error;
        if (!data || typeof data !== "object") return null;
        const row = data as { api_key_ciphertext?: unknown; webhook_secret_ciphertext?: unknown };
        return {
          apiKeyCiphertext: row.api_key_ciphertext ? String(row.api_key_ciphertext) : null,
          webhookSecretCiphertext: row.webhook_secret_ciphertext ? String(row.webhook_secret_ciphertext) : null,
        };
      },
    },
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
