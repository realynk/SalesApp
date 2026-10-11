"use client";

import { useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { saveSalesCallCompleteFromBoard } from "@/server/actions";

export type SalesCallCompleteDraft = {
  leadId: string;
  opportunityId: string | null;
  companyName: string;
  contactName: string;
  accountFlag: AccountFlag | null;
};

export function SalesCallCompleteDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: SalesCallCompleteDraft | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const today = todayInWorkflowZone();

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    const result = await saveSalesCallCompleteFromBoard(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Sales call complete</DialogTitle>
          <DialogDescription>
            {draft
              ? `After the call with ${draft.contactName} at ${draft.companyName}, notes review and the talent request are scheduled for the call date. The request is not sent until you approve it.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="When the call happened">
            <input className={controlClass} name="call_on" type="date" required defaultValue={today} />
          </Field>
          <Field label="Candidate Interview Availability">
            <textarea
              className={textareaClass}
              name="interview_availability"
              placeholder="Preferred dates, times, and timezone"
              rows={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Preferred dates, times, and timezone for interviewing VA candidates. Interviews are online by default.
            </p>
          </Field>
          <Field label="Meeting notes (optional)">
            <textarea className={textareaClass} name="notes" placeholder="Requirements, headcount, schedule, or anything recruitment should know" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
