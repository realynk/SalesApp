"use client";

import { useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { recordCandidateProfilesSentFromBoard } from "@/server/actions";

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
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
