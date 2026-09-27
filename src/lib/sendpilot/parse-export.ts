import * as XLSX from "xlsx";
import { importSourceFromFilename, mapImportRecords } from "../domain";
import { importFileKindError, importFileSizeError, MAX_IMPORT_ROWS } from "./import-limits";

export function mappedImportRowsFromRecords(records: Record<string, unknown>[]) {
  const mapped = mapImportRecords(records);
  return mapped.map((row) => ({
    row_number: row.rowNumber,
    name: row.name,
    first_name: row.firstName,
    last_name: row.lastName,
    company: row.company,
    email: row.email,
    linkedin_url: row.linkedinUrl,
    phone: row.phone,
    sendpilot_status: row.sendpilotStatus,
    source: row.source,
    extra: row.extra,
  }));
}

export function parseSendPilotExport(bytes: Uint8Array, filename: string) {
  const kindError = importFileKindError(filename);
  if (kindError) return { ok: false as const, error: kindError };
  const sizeError = importFileSizeError(bytes.byteLength);
  if (sizeError) return { ok: false as const, error: sizeError };
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) return { ok: false as const, error: "That workbook has no sheets." };
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<string, unknown>[];
  const rows = mappedImportRowsFromRecords(records);
  if (rows.length === 0) return { ok: false as const, error: "That file has headings but no data rows." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false as const, error: "Import up to 5,000 rows at a time." };
  return {
    ok: true as const,
    filename,
    source: importSourceFromFilename(filename),
    rows,
  };
}

export function exceptionPreviewRows(rows: Array<Record<string, string | null | undefined>>, limit = 40) {
  return rows
    .filter((row) => row.classification !== "new" && row.classification !== "existing" && row.classification !== "archived")
    .slice(0, limit);
}
