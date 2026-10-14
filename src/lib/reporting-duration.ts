import { addDays } from "@/lib/domain";

export const REPORTING_DURATION_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;

export type ReportingDuration = (typeof REPORTING_DURATION_OPTIONS)[number]["value"];

export const REPORTING_TABS = ["overview", "comparison", "conversions", "follow-up"] as const;
export type ReportingTab = (typeof REPORTING_TABS)[number];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  return Boolean(value && ISO_DAY.test(value));
}

export function parseReportingDuration(value?: string): ReportingDuration {
  return REPORTING_DURATION_OPTIONS.some((option) => option.value === value)
    ? (value as ReportingDuration)
    : "all";
}

export function parseReportingTab(value?: string): ReportingTab {
  return REPORTING_TABS.includes(value as ReportingTab) ? (value as ReportingTab) : "overview";
}

export function reportingStartOn(range: ReportingDuration, today: string): string | null {
  if (range === "all" || range === "custom") return null;
  if (range === "today") return today;
  if (range === "ytd") return `${today.slice(0, 4)}-01-01`;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return addDays(today, -(days - 1));
}

/** Inclusive window in a business-calendar timezone. `startOn` null means unbounded past. */
export type ReportingWindow = {
  key: ReportingDuration;
  startOn: string | null;
  endOn: string;
  customFrom: string | null;
  customTo: string | null;
};

export function resolveReportingWindow(input: {
  range?: string;
  from?: string;
  to?: string;
  today: string;
}): ReportingWindow {
  const today = input.today;
  const key = parseReportingDuration(input.range);
  if (key === "custom") {
    let from = isIsoDay(input.from) ? input.from : today;
    let to = isIsoDay(input.to) ? input.to : today;
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    return { key, startOn: from, endOn: to, customFrom: from, customTo: to };
  }
  return {
    key,
    startOn: reportingStartOn(key, today),
    endOn: today,
    customFrom: null,
    customTo: null,
  };
}

export function inReportingRange(iso: string | null | undefined, startOn: string | null) {
  if (!startOn) return true;
  if (!iso) return false;
  return iso.slice(0, 10) >= startOn;
}

export function calendarDateInWindow(day: string | null | undefined, window: Pick<ReportingWindow, "startOn" | "endOn">) {
  if (!day) return false;
  if (window.startOn && day < window.startOn) return false;
  if (day > window.endOn) return false;
  return true;
}

export function reportingHref(input: {
  tab?: string;
  range: ReportingDuration;
  customFrom?: string | null;
  customTo?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "overview") params.set("tab", input.tab);
  if (input.range !== "all") params.set("range", input.range);
  if (input.range === "custom") {
    if (input.customFrom) params.set("from", input.customFrom);
    if (input.customTo) params.set("to", input.customTo);
  }
  const query = params.toString();
  return query ? `/reporting?${query}` : "/reporting";
}

export function eachCalendarDay(startOn: string, endOn: string) {
  const days: string[] = [];
  let cursor = startOn;
  while (cursor <= endOn) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    if (days.length > 400) break;
  }
  return days;
}
