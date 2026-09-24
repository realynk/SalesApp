import { format, parseISO } from "date-fns";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = parseISO(value.length <= 10 ? value : value.slice(0, 10));
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "MMM d, yyyy");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "MMM d, yyyy · h:mm a");
}

export function formatPercent(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

export function fullName(first: string | null | undefined, last: string | null | undefined) {
  return [first, last].filter(Boolean).join(" ") || "Unnamed contact";
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
