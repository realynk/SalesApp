import { actionError } from "@/lib/errors";
import { IMPORT_STORAGE_BUCKET } from "@/lib/sendpilot/import-limits";
import { exceptionPreviewRows, parseSendPilotExport } from "@/lib/sendpilot/parse-export";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportPreviewSummary = {
  total: number;
  new: number;
  existing: number;
  updated: number;
  possible_duplicates: number;
  unmatched: number;
  archived?: number;
  suppressed?: number;
  review: number;
};

function isOwnedPath(userId: string, storagePath: string) {
  return storagePath.startsWith(`${userId}/`) && !storagePath.includes("..");
}

export async function loadImportFile(
  supabase: SupabaseClient,
  userId: string,
  storagePath: string,
) {
  if (!isOwnedPath(userId, storagePath)) {
    return { ok: false as const, error: "That import file could not be found." };
  }
  const { data, error } = await supabase.storage.from(IMPORT_STORAGE_BUCKET).download(storagePath);
  if (error || !data) return { ok: false as const, error: "The uploaded export could not be read. Upload it again." };
  const bytes = new Uint8Array(await data.arrayBuffer());
  const filename = storagePath.split("/").pop() ?? "export.csv";
  return { ok: true as const, bytes, filename };
}

export async function previewStoredImport(
  supabase: SupabaseClient,
  userId: string,
  storagePath: string,
  originalName: string,
) {
  const loaded = await loadImportFile(supabase, userId, storagePath);
  if (!loaded.ok) return loaded;
  const parsed = parseSendPilotExport(loaded.bytes, originalName || loaded.filename);
  if (!parsed.ok) return parsed;
  const payload = { filename: parsed.filename, source: parsed.source, rows: parsed.rows };
  const { data, error } = await supabase.rpc("preview_sendpilot_import", { payload });
  if (error) return { ok: false as const, error: actionError(error) };
  const preview = data as ImportPreviewSummary & { rows?: Array<Record<string, string | null>> };
  const { rows, ...counts } = preview;
  return {
    ok: true as const,
    filename: parsed.filename,
    source: parsed.source,
    storagePath,
    preview: counts,
    exceptions: exceptionPreviewRows(rows ?? []),
  };
}

export async function applyStoredImport(
  supabase: SupabaseClient,
  userId: string,
  storagePath: string,
  originalName: string,
) {
  const loaded = await loadImportFile(supabase, userId, storagePath);
  if (!loaded.ok) return loaded;
  const parsed = parseSendPilotExport(loaded.bytes, originalName || loaded.filename);
  if (!parsed.ok) return parsed;
  const payload = { filename: parsed.filename, source: parsed.source, rows: parsed.rows };
  const { data, error } = await supabase.rpc("apply_sendpilot_import", { payload });
  if (error) return { ok: false as const, error: actionError(error) };
  await supabase.storage.from(IMPORT_STORAGE_BUCKET).remove([storagePath]);
  return {
    ok: true as const,
    result: data as {
      sync_id: string;
      total: number;
      new: number;
      existing: number;
      updated: number;
      possible_duplicates: number;
      unmatched: number;
      errors: number;
    },
  };
}
