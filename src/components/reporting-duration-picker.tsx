"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function ReportingDurationPicker({ value }: { value: ReportingDuration }) {
  const router = useRouter();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(window.location.search);
        if (next === "all") params.delete("range");
        else params.set("range", next);
        const query = params.toString();
        router.replace(query ? `/reporting?${query}` : "/reporting");
      }}
    >
      <SelectTrigger size="sm" aria-label="Duration" className="min-w-[10.5rem] bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {REPORTING_DURATION_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
