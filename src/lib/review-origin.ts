export type ReviewOriginInput = {
  recordSource?: string | null;
  syncSource?: string | null;
  filename?: string | null;
  integrationName?: string | null;
  campaignName?: string | null;
  campaignId?: string | null;
};

export type ReviewOrigin = {
  channel: "file" | "webhook" | "unknown";
  label: string;
  title: string;
};

function clean(value?: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function reviewRecordOrigin(input: ReviewOriginInput): ReviewOrigin {
  const syncSource = clean(input.syncSource)?.toLowerCase() ?? null;
  const filename = clean(input.filename);
  const integrationName = clean(input.integrationName);
  const campaign = clean(input.campaignName) ?? clean(input.campaignId);
  const rowSource = clean(input.recordSource);
  const channel: ReviewOrigin["channel"] =
    syncSource === "webhook" || rowSource === "webhook"
      ? "webhook"
      : syncSource === "csv" || syncSource === "xls" || syncSource === "xlsx"
        ? "file"
        : filename
          ? "file"
          : "unknown";

  const parts: string[] = [];
  if (integrationName) parts.push(integrationName);
  if (channel === "webhook") parts.push("SendPilot webhook");
  else if (channel === "file") parts.push("file import");
  if (filename && filename !== integrationName) parts.push(filename);
  if (campaign && campaign !== filename && campaign !== integrationName) parts.push(campaign);
  if (rowSource && rowSource !== "webhook" && rowSource !== "sendpilot" && !parts.includes(rowSource)) {
    parts.push(rowSource);
  }

  const label = parts.length > 0 ? parts.join(" · ") : "Unknown source";
  return { channel, label, title: label };
}

export function bulkReviewEligible(record: { classification?: string | null }, action: "create" | "skip" | "apply") {
  const classification = record.classification ?? "";
  if (classification === "possible_same_person" || classification === "identity_conflict") return false;
  if (action === "create") return classification !== "suppressed";
  if (action === "apply") return classification === "possible_duplicate";
  return true;
}
