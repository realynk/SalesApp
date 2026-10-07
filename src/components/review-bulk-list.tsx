"use client";

import { useMemo, useState } from "react";
import { ReviewRecordCard } from "@/components/reconciliation-review";
import { SubmitButton } from "@/components/forms";
import type { ReviewRecord } from "@/lib/data";
import { bulkReviewEligible } from "@/lib/review-origin";
import { bulkApplyReviewedDuplicates, bulkCreateReviewedRecords, bulkSkipReviewedRecords } from "@/server/actions";

export function ReviewBulkList({ records }: { records: ReviewRecord[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const createCount = selected.filter((id) => {
    const record = records.find((item) => item.id === id);
    return record && bulkReviewEligible(record, "create");
  }).length;
  const applyCount = selected.filter((id) => {
    const record = records.find((item) => item.id === id);
    return record && bulkReviewEligible(record, "apply");
  }).length;

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? records.map((record) => record.id) : []);
  }

  if (records.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No unmatched or duplicate rows are waiting.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.length > 0 && selected.length === records.length}
            onChange={(event) => toggleAll(event.target.checked)}
          />
          All
        </label>
        <p className="mr-auto text-xs text-muted-foreground">{selected.length} selected</p>
        <form action={bulkCreateReviewedRecords} className="flex flex-wrap items-center gap-2">
          {selected.map((id) => <input key={`create-${id}`} type="hidden" name="record_id" value={id} />)}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" name="create_opportunity" value="yes" />
            Opportunity
          </label>
          <SubmitButton>Create{createCount ? ` (${createCount})` : ""}</SubmitButton>
        </form>
        <form action={bulkApplyReviewedDuplicates}>
          {selected.map((id) => <input key={`apply-${id}`} type="hidden" name="record_id" value={id} />)}
          <SubmitButton variant="outline">Keep current{applyCount ? ` (${applyCount})` : ""}</SubmitButton>
        </form>
        <form action={bulkSkipReviewedRecords}>
          {selected.map((id) => <input key={`skip-${id}`} type="hidden" name="record_id" value={id} />)}
          <SubmitButton variant="outline">Skip{selected.length ? ` (${selected.length})` : ""}</SubmitButton>
        </form>
      </div>
      <ul className="space-y-3">
        {records.map((record) => (
          <li key={record.id}>
            <ReviewRecordCard
              record={record}
              select={
                <label className="mt-1">
                  <span className="sr-only">Select {record.full_name || "import row"}</span>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(record.id)}
                    onChange={(event) => toggle(record.id, event.target.checked)}
                  />
                </label>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
