import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/sendpilot/secrets";
import { GMAIL_MIGRATION_REQUIRED, isMissingColumnError } from "@/lib/migration-columns";

export { GMAIL_MIGRATION_REQUIRED };

type ConnectionRow = {
  user_id: string;
  email: string;
  refresh_token_ciphertext: string;
};

export function isMissingGmailTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return (
    isMissingColumnError(error) ||
    error.code === "PGRST205" ||
    /gmail_connections/i.test(error.message ?? "")
  );
}

export async function loadGmailConnectionRow(supabase: SupabaseClient, userId: string) {
  const loaded = await supabase.from("gmail_connections").select("user_id, email, refresh_token_ciphertext").eq("user_id", userId).maybeSingle();
  if (loaded.error) {
    return { error: isMissingGmailTable(loaded.error) ? GMAIL_MIGRATION_REQUIRED : loaded.error.message };
  }
  return { row: (loaded.data as ConnectionRow | null) ?? null };
}

export function decryptGmailRefreshToken(ciphertext: string) {
  return decryptSecret(ciphertext);
}

export async function upsertGmailConnection(
  supabase: SupabaseClient,
  input: { userId: string; email: string; refreshToken: string },
) {
  let ciphertext: string;
  try {
    ciphertext = encryptSecret(input.refreshToken);
  } catch {
    return { error: "Gmail tokens cannot be stored until SENDPILOT_SECRETS_ENCRYPTION_KEY is set." };
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("gmail_connections").upsert({
    user_id: input.userId,
    email: input.email,
    refresh_token_ciphertext: ciphertext,
    updated_at: now,
    connected_at: now,
  });
  if (error) {
    return { error: isMissingGmailTable(error) ? GMAIL_MIGRATION_REQUIRED : error.message };
  }
  return { ok: true as const };
}

export async function deleteGmailConnection(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("gmail_connections").delete().eq("user_id", userId);
  if (error) {
    return { error: isMissingGmailTable(error) ? GMAIL_MIGRATION_REQUIRED : error.message };
  }
  return { ok: true as const };
}
