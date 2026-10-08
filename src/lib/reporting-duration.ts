import { addDays } from "@/lib/domain";

export const REPORTING_DURATION_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
] as const;

export type ReportingDuration = (typeof REPORTING_DURATION_OPTIONS)[number]["value"];

export function parseReportingDuration(value?: string): ReportingDuration {
  return REPORTING_DURATION_OPTIONS.some((option) => option.value === value)
    ? (value as ReportingDuration)
    : "all";
}

export function reportingStartOn(range: ReportingDuration, today: string): string | null {
  if (range === "all") return null;
  if (range === "ytd") return `${today.slice(0, 4)}-01-01`;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return addDays(today, -(days - 1));
}

export function inReportingRange(iso: string | null | undefined, startOn: string | null) {
  if (!startOn) return true;
  if (!iso) return false;
  return iso.slice(0, 10) >= startOn;
}
