"use client";

import { useEffect, useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { loadBoardWorkContext, recordCandidateProfilesSentFromBoard } from "@/server/actions";

export function CandidateProfilesSentDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: { leadId: string; opportunityId: string | null; companyName: string } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!draft?.opportunityId) return;
    let cancelled = false;
    void loadBoardWorkContext(draft.opportunityId).then((result) => {
      if (!cancelled) setCandidates(result.candidates);
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    const result = await recordCandidateProfilesSentFromBoard(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Candidate profiles sent</DialogTitle>
          <DialogDescription>
            This is after recruitment, not the first sales/VA introduction. When were the candidate profiles sent to the client?
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Sent date">
            <input className={controlClass} name="sent_on" type="date" required defaultValue={todayInWorkflowZone()} />
          </Field>
          {candidates.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Candidates sent</legend>
              {candidates.map((candidate) => (
                <label key={candidate.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="candidate_id" value={candidate.id} />
                  {candidate.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <Field label="How many profiles were sent?">
              <input className={controlClass} name="profile_count" type="number" min="1" required defaultValue="1" />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
