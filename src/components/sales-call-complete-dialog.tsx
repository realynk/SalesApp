"use client";

import { useEffect, useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { emptyLiveSalesCallValues } from "@/lib/live-sales-call";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { loadLiveSalesCall, saveSalesCallCompleteFromBoard } from "@/server/actions";

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
  const [saved, setSaved] = useState(emptyLiveSalesCallValues());
  const today = todayInWorkflowZone();

  useEffect(() => {
    const opportunityId = draft?.opportunityId;
    if (!opportunityId) return;
    let cancelled = false;
    void loadLiveSalesCall(opportunityId).then((result) => {
      if (cancelled || "error" in result) return;
      setSaved(result.values);
    });
    return () => {
      cancelled = true;
    };
  }, [draft?.opportunityId]);

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
            <input className={controlClass} name="call_on" type="date" required defaultValue={saved.callOn || today} />
          </Field>
          <Field label="Candidate Interview Availability">
            <textarea
              className={textareaClass}
              name="interview_availability"
              placeholder="Preferred dates, times, and timezone"
              rows={3}
              defaultValue={saved.interviewAvailability}
              key={`availability-${saved.interviewAvailability}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Preferred dates, times, and timezone for interviewing VA candidates. Interviews are online by default.
            </p>
          </Field>
          <Field label="Meeting notes (optional)">
            <textarea
              className={textareaClass}
              name="notes"
              placeholder="Requirements, headcount, schedule, or anything recruitment should know"
              defaultValue={saved.notes}
              key={`notes-${saved.notes}`}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Prefer capturing the full requirements on the live sales call form. Completing here marks the call done and moves the pipeline.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
