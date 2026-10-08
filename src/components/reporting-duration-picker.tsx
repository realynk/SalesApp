"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REPORTING_DURATION_OPTIONS,
  type ReportingDuration,
} from "@/lib/reporting-duration";

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
