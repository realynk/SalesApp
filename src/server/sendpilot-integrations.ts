"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError } from "@/lib/errors";
import { publicAppBaseUrl } from "@/lib/env";
import { buildCredentialCiphertextRow } from "@/lib/sendpilot/credentials";
import { probeSendPilotApiCredentials } from "@/lib/sendpilot/client";
import { planCampaignSync } from "@/lib/sendpilot/campaign-sync";
import {
  ACTIVATION_BLOCKED,
  ENCRYPTION_NOT_CONFIGURED,
  INTEGRATION_NOT_FOUND,
  LEGACY_MUTATION_DENIED,
  authorizeSendPilotMutation,
  campaignSyncStatus,
  parseTrackingMode,
  planActivation,
  planCampaignTrackingRows,
  planCreateAudits,
  planDisable,
  planNewIntegrationRow,
  planRemove,
  planRotateCredentials,
  planSafeSaveResult,
  planTrackingModeChange,
  sanitizeAuditMetadata,
  uniqueCampaignIds,
  webhookUrlForIntegration,
} from "@/lib/sendpilot/manage";
import { SecretConfigError } from "@/lib/sendpilot/secrets";
import { mapSendPilotApiProbe } from "@/lib/sendpilot/verify-api";
import { createAdminClient, supabaseServiceRoleKey } from "@/lib/supabase/admin";
import { text, type ActionState } from "@/server/form";
import { requireUser } from "@/server/session";

function refreshIntegrations(...extra: string[]) {
  revalidatePath("/settings");
  revalidatePath("/settings/sendpilot");
  for (const path of extra) revalidatePath(path);
}

function selectedCampaignIds(formData: FormData) {
  return uniqueCampaignIds(formData.getAll("campaign_id").map((value) => (typeof value === "string" ? value : "")));
}

async function requireAdmin() {
  const session = await requireUser();
  const auth = authorizeSendPilotMutation(session.profile?.role);
  return { session, auth };
}

function credentialStoreError() {
  return "Credential storage is not configured.";
}

async function loadIntegrationRow(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  id: string,
) {
  const { data, error } = await supabase
    .from("sendpilot_integrations")
    .select("id, name, status, tracking_mode, legacy_env")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: actionError(error) } as const;
  if (!data) return { error: INTEGRATION_NOT_FOUND } as const;
  return {
    row: data as {
      id: string;
      name: string;
      status: string;
      tracking_mode: string;
      legacy_env: boolean;
    },
  };
}

async function writeAudits(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  actorId: string,
  integrationId: string,
  rows: { action: string; campaign_id?: string | null; metadata?: Record<string, unknown> }[],
) {
  const payload = rows.map((row) => ({
    actor_id: actorId,
    integration_id: integrationId,
    action: row.action,
    campaign_id: row.campaign_id ?? null,
    metadata: sanitizeAuditMetadata(row.metadata ?? {}),
  }));
  const { error } = await supabase.from("sendpilot_integration_audit").insert(payload);
  return error;
}

async function upsertEncryptedCredentials(integrationId: string, apiKey: string, webhookSecret: string) {
  if (!supabaseServiceRoleKey()) return { error: credentialStoreError() } as const;
  try {
    const admin = createAdminClient();
    const { data: existing } = await admin.rpc("sendpilot_load_integration_credentials", {
      p_integration_id: integrationId,
    });
    const existingRow =
      existing && typeof existing === "object"
        ? {
            api_key_ciphertext:
              typeof (existing as { api_key_ciphertext?: unknown }).api_key_ciphertext === "string"
                ? (existing as { api_key_ciphertext: string }).api_key_ciphertext
                : null,
            webhook_secret_ciphertext:
              typeof (existing as { webhook_secret_ciphertext?: unknown }).webhook_secret_ciphertext === "string"
                ? (existing as { webhook_secret_ciphertext: string }).webhook_secret_ciphertext
                : null,
          }
        : undefined;
    const packed = buildCredentialCiphertextRow({
      integrationId,
      apiKey,
      webhookSecret,
      existing: existingRow,
      nowIso: new Date().toISOString(),
    });
    const { error } = await admin.rpc("sendpilot_upsert_integration_credentials", {
      p_integration_id: integrationId,
      p_api_key_ciphertext: packed.api_key_ciphertext,
      p_webhook_secret_ciphertext: packed.webhook_secret_ciphertext,
      p_key_version: packed.key_version,
    });
    if (error) return { error: "Credentials could not be saved." } as const;
    return { ok: true as const };
  } catch (error) {
    if (error instanceof SecretConfigError) return { error: ENCRYPTION_NOT_CONFIGURED } as const;
    return { error: "Credentials could not be saved." } as const;
  }
}

export async function verifySendPilotAccount(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const apiKey = String(formData.get("api_key") ?? "");
  if (!apiKey.trim()) return { error: "Enter a SendPilot API key." };
  try {
    const probe = await probeSendPilotApiCredentials({ apiKey: apiKey.trim() });
    const mapped = mapSendPilotApiProbe(probe);
    if (!mapped.ok) return { error: mapped.error };
    return { success: `API key accepted. ${mapped.workspaceMessage}` };
  } catch {
    return { error: "SendPilot API unavailable." };
  }
}

export async function createSendPilotIntegration(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const name = text(formData, "name");
  const apiKey = String(formData.get("api_key") ?? "");
  const webhookSecret = String(formData.get("webhook_secret") ?? "");
  const trackingMode = parseTrackingMode(text(formData, "tracking_mode")) ?? "all";
  const selected = selectedCampaignIds(formData);

  const plannedRow = planNewIntegrationRow({ name, actorId: session.userId, trackingMode });
  if ("error" in plannedRow) return { error: plannedRow.error };
  if (!apiKey.trim() || !webhookSecret.trim()) return { error: "Enter the API key and webhook signing secret." };

  const trackingPlan = planTrackingModeChange({
    legacyEnv: false,
    mode: trackingMode,
    selectedCampaignIds: selected,
  });
  if ("error" in trackingPlan) return { error: trackingPlan.error };

  try {
    const probe = await probeSendPilotApiCredentials({ apiKey: apiKey.trim() });
    const mapped = mapSendPilotApiProbe(probe);
    if (!mapped.ok) return { error: mapped.error };
  } catch {
    return { error: "SendPilot API unavailable." };
  }

  const { data, error } = await session.supabase
    .from("sendpilot_integrations")
    .insert(plannedRow.row)
    .select("id")
    .single();
  if (error || !data) return { error: actionError(error) };
  const integrationId = String((data as { id: string }).id);

  const stored = await upsertEncryptedCredentials(integrationId, apiKey.trim(), webhookSecret.trim());
  if ("error" in stored) {
    await session.supabase.from("sendpilot_integrations").update({ credentials_present: false }).eq("id", integrationId);
    return { error: stored.error };
  }

  const trackingRows = planCampaignTrackingRows({
    integrationId,
    mode: trackingMode,
    selectedCampaignIds: selected,
    existing: [],
    nowIso: new Date().toISOString(),
  });
  if ("error" in trackingRows) return { error: trackingRows.error };
  if (trackingRows.upserts.length > 0) {
    const { error: trackingError } = await session.supabase.from("sendpilot_campaign_tracking").upsert(trackingRows.upserts, {
      onConflict: "integration_id,sendpilot_campaign_id",
    });
    if (trackingError) return { error: actionError(trackingError) };
    const campaignTrackAudit = await writeAudits(session.supabase, session.userId, integrationId, [
      { action: "campaign_tracking_changed", metadata: { selected_count: selected.length, tracking_mode: trackingMode } },
    ]);
    if (campaignTrackAudit) return { error: actionError(campaignTrackAudit) };
  }

  const auditError = await writeAudits(
    session.supabase,
    session.userId,
    integrationId,
    planCreateAudits({ trackingMode, selectedCount: selected.length }),
  );
  if (auditError) return { error: actionError(auditError) };

  planSafeSaveResult({
    id: integrationId,
    name,
    trackingMode,
    webhookUrl: webhookUrlForIntegration({ id: integrationId, legacyEnv: false, baseUrl: publicAppBaseUrl() }),
  });

  refreshIntegrations(`/settings/sendpilot/${integrationId}`);
  redirect(`/settings/sendpilot/${integrationId}`);
}

export async function rotateSendPilotCredentials(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const allowed = planRotateCredentials({ legacyEnv: loaded.row.legacy_env });
  if ("error" in allowed) return { error: allowed.error };

  const apiKey = String(formData.get("api_key") ?? "");
  const webhookSecret = String(formData.get("webhook_secret") ?? "");
  if (!apiKey.trim() || !webhookSecret.trim()) return { error: "Enter the new API key and webhook signing secret." };

  try {
    const probe = await probeSendPilotApiCredentials({ apiKey: apiKey.trim() });
    const mapped = mapSendPilotApiProbe(probe);
    if (!mapped.ok) return { error: mapped.error };
  } catch {
    return { error: "SendPilot API unavailable." };
  }

  const stored = await upsertEncryptedCredentials(id, apiKey.trim(), webhookSecret.trim());
  if ("error" in stored) return { error: stored.error };

  const { error: presentError } = await session.supabase
    .from("sendpilot_integrations")
    .update({ credentials_present: true })
    .eq("id", id);
  if (presentError) return { error: actionError(presentError) };

  const auditError = await writeAudits(session.supabase, session.userId, id, [
    { action: "credentials_rotated", metadata: { source: "settings" } },
  ]);
  if (auditError) return { error: actionError(auditError) };

  refreshIntegrations(`/settings/sendpilot/${id}`);
  return { success: "Credentials were rotated. The previous values are not shown." };
}

export async function saveSendPilotTracking(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const selected = selectedCampaignIds(formData);
  const planned = planTrackingModeChange({
    legacyEnv: loaded.row.legacy_env,
    mode: text(formData, "tracking_mode"),
    selectedCampaignIds: selected,
  });
  if ("error" in planned) return { error: planned.error };

  const { data: existing, error: existingError } = await session.supabase
    .from("sendpilot_campaign_tracking")
    .select("sendpilot_campaign_id, tracked")
    .eq("integration_id", id);
  if (existingError) return { error: actionError(existingError) };

  const rows = planCampaignTrackingRows({
    integrationId: id,
    mode: planned.mode,
    selectedCampaignIds: selected,
    existing: (existing ?? []).map((row) => ({
      sendpilotCampaignId: String((row as { sendpilot_campaign_id: string }).sendpilot_campaign_id),
      tracked: Boolean((row as { tracked: boolean }).tracked),
    })),
    nowIso: new Date().toISOString(),
  });
  if ("error" in rows) return { error: rows.error };

  const { error: updateError } = await session.supabase
    .from("sendpilot_integrations")
    .update({ tracking_mode: planned.mode })
    .eq("id", id);
  if (updateError) return { error: actionError(updateError) };

  if (rows.upserts.length > 0) {
    const { error: trackingError } = await session.supabase.from("sendpilot_campaign_tracking").upsert(rows.upserts, {
      onConflict: "integration_id,sendpilot_campaign_id",
    });
    if (trackingError) return { error: actionError(trackingError) };
  }

  const auditError = await writeAudits(session.supabase, session.userId, id, [
    { action: "tracking_mode_changed", metadata: { tracking_mode: planned.mode } },
    { action: "campaign_tracking_changed", metadata: { selected_count: selected.length, tracking_mode: planned.mode } },
  ]);
  if (auditError) return { error: actionError(auditError) };

  refreshIntegrations(`/settings/sendpilot/${id}`);
  return { success: "Campaign tracking was saved." };
}

export async function disableSendPilotIntegration(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const planned = planDisable({
    legacyEnv: loaded.row.legacy_env,
    status: loaded.row.status,
    nowIso: new Date().toISOString(),
  });
  if ("error" in planned) return { error: planned.error };
  const { error } = await session.supabase.from("sendpilot_integrations").update(planned.patch).eq("id", id);
  if (error) return { error: actionError(error) };
  const auditError = await writeAudits(session.supabase, session.userId, id, [
    { action: "integration_disabled", metadata: { preserved: ["credentials", "campaigns", "identities"] } },
  ]);
  if (auditError) return { error: actionError(auditError) };
  refreshIntegrations(`/settings/sendpilot/${id}`);
  return { success: "Integration disabled. Configuration and history were preserved." };
}

export async function removeSendPilotIntegration(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const planned = planRemove({ legacyEnv: loaded.row.legacy_env, nowIso: new Date().toISOString() });
  if ("error" in planned) return { error: planned.error };
  if (planned.hardDelete) return { error: LEGACY_MUTATION_DENIED };
  const { error } = await session.supabase.from("sendpilot_integrations").update(planned.patch).eq("id", id);
  if (error) return { error: actionError(error) };
  const auditError = await writeAudits(session.supabase, session.userId, id, [
    {
      action: "integration_removed",
      metadata: { soft: true, webhook_note: "Remove the SendPilot webhook manually later." },
    },
  ]);
  if (auditError) return { error: actionError(auditError) };
  refreshIntegrations(`/settings/sendpilot/${id}`);
  return { success: "Integration marked removed. History was kept. Remove the webhook in SendPilot manually later." };
}

export async function activateSendPilotIntegration(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const planned = planActivation({ legacyEnv: loaded.row.legacy_env, status: loaded.row.status });
  return { error: planned.error || ACTIVATION_BLOCKED };
}

export async function syncSendPilotCampaigns(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { session, auth } = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const id = text(formData, "integration_id");
  const loaded = await loadIntegrationRow(session.supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  void planCampaignSync();
  return { error: campaignSyncStatus().message };
}
