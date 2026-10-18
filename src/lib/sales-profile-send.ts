export const SALES_PROFILE_EMAIL_DRAFT_MARKER = "=== SALES_PROFILE_EMAIL_DRAFT ===";
export const SALES_PROFILE_INTERNAL_NOTES_MARKER = "=== INTERNAL_NOTES ===";
export const MANUAL_SALES_PROFILE_SENT_CONFIRM = "outside";
export const SALES_PROFILE_FOLLOW_UP_TYPES = [
  "sales_profile_follow_1",
  "sales_profile_follow_2",
  "sales_profile_follow_3",
] as const;

export type SalesProfileEmailDraft = {
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  notes: string;
};

export type SalesProfileSendOutcome = "draft" | "gmail" | "manual";

export function encodeSalesProfileEmailDraft(input: SalesProfileEmailDraft) {
  return [
    SALES_PROFILE_EMAIL_DRAFT_MARKER,
    `From: ${input.from.trim()}`,
    `To: ${input.to.trim()}`,
    `Cc: ${input.cc.trim()}`,
    `Subject: ${input.subject.trim()}`,
    "",
    input.body.replace(/\s+$/g, ""),
    "",
    SALES_PROFILE_INTERNAL_NOTES_MARKER,
    input.notes.trim(),
  ].join("\n").trim();
}

export function parseSalesProfileEmailDraft(raw: string | null | undefined): SalesProfileEmailDraft | null {
  const text = String(raw ?? "");
  if (!text.includes(SALES_PROFILE_EMAIL_DRAFT_MARKER)) return null;
  const after = text.split(SALES_PROFILE_EMAIL_DRAFT_MARKER)[1] ?? "";
  const [emailPart, notesPart = ""] = after.split(SALES_PROFILE_INTERNAL_NOTES_MARKER);
  const lines = (emailPart ?? "").replace(/^\n+/, "").split("\n");
  const field = (name: string) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    return line ? line.slice(name.length + 1).trim() : "";
  };
  const blank = lines.findIndex((line, index) => index >= 4 && line.trim() === "");
  const body = (blank >= 0 ? lines.slice(blank + 1) : lines.slice(4)).join("\n").trim();
  return {
    from: field("From"),
    to: field("To"),
    cc: field("Cc"),
    subject: field("Subject"),
    body,
    notes: notesPart.trim(),
  };
}

export function isSalesProfileEmailDraft(raw: string | null | undefined) {
  return String(raw ?? "").includes(SALES_PROFILE_EMAIL_DRAFT_MARKER);
}

export function shouldPlanSalesProfileFollowUps(outcome: SalesProfileSendOutcome, alreadySent: boolean) {
  return outcome !== "draft" && !alreadySent;
}

export function salesProfileSentActivityTitle() {
  return "Profile sent to the client";
}
