import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { ReviewRecord } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { applyReviewedDuplicate, createFromReviewedRecord, skipReviewedRecord } from "@/server/actions";

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function ReviewRecordCard({ record }: { record: ReviewRecord }) {
  const id = record.id;
  const classification = textValue(record.classification, "unmatched");
  const importedTag = textValue(record.sendpilot_status, "None");
  const existing = record.existing ?? null;
  const isDuplicate = classification === "possible_duplicate";
  const isSuppressed = classification === "suppressed";

  return (
    <li className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <div>
        <p className="font-medium">{textValue(record.full_name, "Unnamed")} — {textValue(record.company_name, "No company")}</p>
        <p className="text-muted-foreground">{classification} · {textValue(record.review_reason, "Needs a person to decide")}</p>
        <p className="text-xs text-muted-foreground">{textValue(record.email, "No email")} · imported tag: {importedTag} · {formatDateTime(textValue(record.created_at, ""))}</p>
      </div>

      {existing ? (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Already in SalesApp</p>
          <p className="mt-1 font-medium">{existing.contactName} — {existing.companyName}</p>
          <p className="text-muted-foreground">
            {existing.email ?? "No email"} · current tag: {existing.sendpilotStatus ?? "None"}
            {existing.opportunityStage ? ` · opportunity: ${existing.opportunityStage}` : " · no opportunity"}
          </p>
          <p className="mt-1 text-xs">
            <Link className="font-medium text-primary" href={`/leads/${existing.leadId}`}>Open current lead</Link>
          </p>
        </div>
      ) : null}

      {isDuplicate && existing ? (
        <ActionForm action={applyReviewedDuplicate} className="space-y-2 rounded-lg border border-border p-3">
          <input type="hidden" name="record_id" value={id} />
          <p className="font-medium">Use the current lead</p>
          <p className="text-xs text-muted-foreground">Do not add a second lead. Choose what happens to tagging on the record already in the system.</p>
          <label className="flex items-start gap-2">
            <input type="radio" name="tagging" value="keep" required defaultChecked />
            <span>Keep current tagging{existing.sendpilotStatus ? ` (${existing.sendpilotStatus})` : ""}</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="tagging" value="replace" />
            <span>Replace tagging with the imported tag ({importedTag})</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="tagging" value="clear" />
            <span>Clear tagging on the current lead</span>
          </label>
          {existing.opportunityId ? null : (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="create_opportunity" value="yes" />
              Also create an opportunity on this lead
            </label>
          )}
          <SubmitButton>Apply to current lead</SubmitButton>
        </ActionForm>
      ) : null}

      <ActionForm action={createFromReviewedRecord} className="space-y-2 rounded-lg border border-border p-3">
        <input type="hidden" name="record_id" value={id} />
        <p className="font-medium">{isDuplicate ? "Create a new lead (duplicate)" : "Create a new lead"}</p>
        <p className="text-xs text-muted-foreground">
          {isDuplicate
            ? "Adds this import row as another lead, even if someone similar already exists."
            : "Adds this import row to the current leads list."}
        </p>
        {isSuppressed ? (
          <label className="flex items-center gap-2"><input type="checkbox" name="lift_suppression" value="yes" required /> Recreate this permanently deleted SendPilot lead on purpose.</label>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="create_opportunity" value="yes" />
          Also create an opportunity
        </label>
        <SubmitButton variant="outline">{isDuplicate ? "Create new lead" : "Create contact from this row"}</SubmitButton>
      </ActionForm>

      <form action={skipReviewedRecord}>
        <input type="hidden" name="record_id" value={id} />
        <p className="mb-2 text-xs text-muted-foreground">Do not add this import row to the system.</p>
        <SubmitButton variant="outline">Skip this row</SubmitButton>
      </form>
    </li>
  );
}
