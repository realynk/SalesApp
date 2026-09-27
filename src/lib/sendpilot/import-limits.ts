export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_STORAGE_BUCKET = "sendpilot-imports";

export function importFileKindError(filename: string) {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    return "Use a CSV, XLS, or XLSX export. Other file types are not imported.";
  }
  return null;
}

export function importFileSizeError(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Choose a CSV, XLS, or XLSX file.";
  if (bytes > MAX_IMPORT_BYTES) {
    return "That export is larger than 15 MB. Split it or export fewer columns, then try again.";
  }
  return null;
}

export function importPreviewRequestBody(storagePath: string, filename: string) {
  return JSON.stringify({ storagePath, filename });
}
