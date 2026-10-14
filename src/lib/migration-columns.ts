export const UX_MIGRATION_REQUIRED =
  "This workspace still needs the pipeline UX migration. Drafts, sent dates, and manual next actions cannot be saved yet.";

export const AUTOMATION_MIGRATION_REQUIRED =
  "This workspace still needs the pipeline automation migration. Follow-up tasks cannot be saved yet.";

const UX_COLUMNS = /next_action_manual|talent_request_draft|talent_request_sent_on/i;
const AUTOMATION_COLUMNS = /automation_key|automation_type|urgent|pending_schedule|follow_up_id|target_start_on/i;

export function isMissingColumnError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || /column|schema cache|could not find/i.test(error.message ?? "");
}

export function writeFailureMessage(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
) {
  if (!error) return fallback;
  const message = error.message ?? "";
  if (isMissingColumnError(error) && UX_COLUMNS.test(message)) return UX_MIGRATION_REQUIRED;
  if (isMissingColumnError(error) && AUTOMATION_COLUMNS.test(message)) return AUTOMATION_MIGRATION_REQUIRED;
  return message.trim() || fallback;
}

export function isCountableProfileBatch(batch: { profileCount?: number | null; clientResponse?: string | null }) {
  return (batch.profileCount ?? 0) > 0;
}

export function resolvedProfileCount(candidateIds: string[], rawCount: string | number | null | undefined) {
  if (candidateIds.length > 0) return candidateIds.length;
  const parsed = typeof rawCount === "number" ? rawCount : Number(String(rawCount ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
