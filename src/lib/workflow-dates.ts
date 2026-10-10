import { dateInTimeZone } from "@/lib/domain";

/** Workflow deadlines use US Eastern, including DST. */
export const WORKFLOW_TIMEZONE = "America/New_York";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayInWorkflowZone(now = new Date()) {
  return dateInTimeZone(now.toISOString(), WORKFLOW_TIMEZONE) ?? now.toISOString().slice(0, 10);
}

export function parseIsoDay(value: string | null | undefined) {
  if (!value) return null;
  const match = value.slice(0, 10).match(ISO_DAY);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
}

/** Calendar-day arithmetic on civil dates. Does not add 24-hour instants. */
export function addCalendarDays(iso: string, days: number) {
  const parsed = parseIsoDay(iso);
  if (!parsed) return iso.slice(0, 10);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return date.toISOString().slice(0, 10);
}

export function weekdayUtc(iso: string) {
  const parsed = parseIsoDay(iso);
  if (!parsed) return 0;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

export function isWeekend(iso: string) {
  const day = weekdayUtc(iso);
  return day === 0 || day === 6;
}

/**
 * Monday–Friday only. US public holidays still count as business days.
 * Does not use 24-hour UTC offsets.
 */
export function addBusinessDays(iso: string, days: number) {
  if (days === 0) return parseIsoDay(iso)?.iso ?? iso.slice(0, 10);
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let cursor = parseIsoDay(iso)?.iso ?? iso.slice(0, 10);
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, direction);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return cursor;
}

/** If the date is Saturday or Sunday, move to the preceding Friday. */
export function previousFridayIfWeekend(iso: string) {
  const parsed = parseIsoDay(iso)?.iso ?? iso.slice(0, 10);
  const day = weekdayUtc(parsed);
  if (day === 6) return addCalendarDays(parsed, -1);
  if (day === 0) return addCalendarDays(parsed, -2);
  return parsed;
}

export function daysBetweenCivil(from: string, to: string) {
  const start = parseIsoDay(from);
  const end = parseIsoDay(to);
  if (!start || !end) return 0;
  const a = Date.UTC(start.year, start.month - 1, start.day);
  const b = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((b - a) / 86_400_000);
}
