import { SENDPILOT_STATUSES } from "@/lib/domain";

export type DuplicateTagging = "keep" | "replace" | "clear";

export function parseDuplicateTagging(value: string): DuplicateTagging | null {
  if (value === "keep" || value === "replace" || value === "clear") return value;
  return null;
}

export function importedSendPilotStatus(raw: string | null | undefined) {
  const value = String(raw ?? "").trim();
  return (SENDPILOT_STATUSES as readonly string[]).includes(value) ? value : null;
}

export function taggingPatch(choice: DuplicateTagging, importedStatus: string | null, importedRaw: string | null) {
  if (choice === "keep") return null;
  if (choice === "clear") {
    return {
      sendpilot_status: null as string | null,
      sendpilot_status_raw: null as string | null,
      not_interested_outcome: null as string | null,
    };
  }
  return {
    sendpilot_status: importedStatus,
    sendpilot_status_raw: importedRaw,
    not_interested_outcome: importedStatus === "Not Interested" ? null : null,
  };
}
