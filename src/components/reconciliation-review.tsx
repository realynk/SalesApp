import type { ReactNode } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { cn } from "cn";
import type { ReviewRecord } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { reviewClassificationLabel, reviewClassificationTone } from "@/lib/review-origin";
import { applyReviewedDuplicate, createFromReviewedRecord, skipReviewedRecord } from "@/server/actions";

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function ReviewRecordCard({
  record,
  select,
  canWrite = true,
}: {
  record: ReviewRecord;
  select?: ReactNode;
  canWrite?: boolean;
}) {
  const id = record.id;
  const classification = textValue(record.classification, "unmatched");
  const importedTag = textValue(record.sendpilot_status, "None");
  const existing = record.existing ?? null;
  const isDuplicate = classification === "possible_duplicate";
  const isSuppressed = classification === "suppressed";
  const isCrossWorkspaceReview =
    classification === "possible_same_person" || classification === "identity_conflict";

  return (
    <article className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        {select}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium tracking-tight">{textValue(record.full_name, "Unnamed")}</p>
              <p className="text-sm text-muted-foreground">{textValue(record.company_name, "No company")}</p>
            </div>
            <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", reviewClassificationTone(classification))}>
              {reviewClassificationLabel(classification)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" title={record.origin.title}>
            {record.origin.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {textValue(record.email, "No email")}
            <span aria-hidden> · </span>
            {importedTag}
            <span aria-hidden> · </span>
            {formatDateTime(textValue(record.created_at, ""))}
          </p>
        </div>
      </div>

      {existing ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Already in SalesApp: {existing.contactName}
          {existing.sendpilotStatus ? ` · ${existing.sendpilotStatus}` : ""}
          {existing.opportunityStage ? ` · ${existing.opportunityStage}` : " · no opportunity"}
          {" · "}
          <Link className="font-medium text-primary hover:underline" href={`/leads/${existing.leadId}`}>Open lead</Link>
        </p>
      ) : null}

      {isCrossWorkspaceReview ? (
        <p className="mt-3 text-xs text-muted-foreground">Held for a later identity decision. CRM was not updated.</p>
      ) : canWrite ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {isDuplicate && existing ? (
            <ActionForm action={applyReviewedDuplicate} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="record_id" value={id} />
              <select name="tagging" defaultValue="keep" className="h-8 rounded-lg border border-input bg-card px-2 text-xs">
                <option value="keep">Keep {existing.sendpilotStatus ?? "current tag"}</option>
                <option value="replace">Use imported {importedTag}</option>
                <option value="clear">Clear tagging</option>
              </select>
              {existing.opportunityId ? null : (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" name="create_opportunity" value="yes" />
                  Opportunity
                </label>
              )}
              <SubmitButton>Keep current</SubmitButton>
            </ActionForm>
          ) : null}

          <ActionForm action={createFromReviewedRecord} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="record_id" value={id} />
            {isSuppressed ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" name="lift_suppression" value="yes" required />
                Recreate deleted
              </label>
            ) : null}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" name="create_opportunity" value="yes" />
              Opportunity
            </label>
            <SubmitButton variant={isDuplicate ? "outline" : "default"}>{isDuplicate ? "Create new" : "Create lead"}</SubmitButton>
          </ActionForm>

          <form action={skipReviewedRecord} className="ml-auto">
            <input type="hidden" name="record_id" value={id} />
            <SubmitButton variant="outline">Skip</SubmitButton>
          </form>
        </div>
      )}
    </article>
  );
}
