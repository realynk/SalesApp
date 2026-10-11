"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const today = todayInWorkflowZone();
  const loading = Boolean(draft?.opportunityId) && loadedFor !== draft?.opportunityId;
  const busy = pending || loading;

  useEffect(() => {
    const opportunityId = draft?.opportunityId;
    if (!opportunityId) return;
    let cancelled = false;
    void loadLiveSalesCall(opportunityId).then((result) => {
      if (cancelled) return;
      if (!("error" in result)) setSaved(result.values);
      setLoadedFor(opportunityId);
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
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Sales call complete</DialogTitle>
          <DialogDescription>
            {draft
              ? `After the call with ${draft.contactName} at ${draft.companyName}, notes review and the talent request are scheduled for the call date. The request is not sent until you approve it.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} aria-busy={busy} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading saved call…
            </p>
          ) : null}
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </p>
          ) : null}
          <Field label="When the call happened">
            <input className={controlClass} name="call_on" type="date" required defaultValue={saved.callOn || today} disabled={busy} />
          </Field>
          <Field label="Candidate Interview Availability">
            <textarea
              className={textareaClass}
              name="interview_availability"
              placeholder="Preferred dates, times, and timezone"
              rows={3}
              defaultValue={saved.interviewAvailability}
              key={`availability-${saved.interviewAvailability}`}
              disabled={busy}
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
              disabled={busy}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Prefer capturing the full requirements on the live sales call form. Completing here marks the call done and moves the pipeline.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={busy}>{pending ? "Saving…" : loading ? "Loading…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
