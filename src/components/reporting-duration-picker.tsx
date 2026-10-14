"use client";

import { useRouter } from "next/navigation";
import { controlClass } from "@/components/bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REPORTING_DURATION_OPTIONS,
  reportingHref,
  type ReportingDuration,
  type ReportingTab,
} from "@/lib/reporting-duration";

export function ReportingDurationPicker({
  value,
  tab,
  customFrom,
  customTo,
  today,
}: {
  value: ReportingDuration;
  tab: ReportingTab;
  customFrom: string | null;
  customTo: string | null;
  today: string;
}) {
  const router = useRouter();

  function go(next: { range?: ReportingDuration; from?: string; to?: string }) {
    const range = next.range ?? value;
    router.replace(
      reportingHref({
        tab,
        range,
        customFrom: range === "custom" ? (next.from ?? customFrom ?? today) : null,
        customTo: range === "custom" ? (next.to ?? customTo ?? today) : null,
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value}
        onValueChange={(next) => go({ range: next as ReportingDuration })}
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
      {value === "custom" ? (
        <>
          <input
            type="date"
            aria-label="From date"
            className={`${controlClass} w-[10.5rem]`}
            value={customFrom ?? today}
            max={today}
            onChange={(event) => go({ from: event.target.value, to: customTo ?? today })}
          />
          <input
            type="date"
            aria-label="To date"
            className={`${controlClass} w-[10.5rem]`}
            value={customTo ?? today}
            max={today}
            onChange={(event) => go({ from: customFrom ?? today, to: event.target.value })}
          />
        </>
      ) : null}
    </div>
  );
}
