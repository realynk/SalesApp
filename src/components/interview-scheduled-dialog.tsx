"use client";

import { useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { saveInterviewFromBoard } from "@/server/actions";

export function InterviewScheduledDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: { leadId: string; opportunityId: string | null; companyName: string; contactName: string } | null;
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
    formData.set("client_name", draft.contactName);
    formData.set("status", "Scheduled");
    const result = await saveInterviewFromBoard(formData);
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
          <DialogTitle>Interview scheduled</DialogTitle>
          <DialogDescription>{draft ? `When is the interview with ${draft.companyName}? The reminder will not include the candidate name.` : ""}</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Interview date">
            <input className={controlClass} name="interview_on" type="date" required defaultValue={todayInWorkflowZone()} />
          </Field>
          <Field label="Interview time">
            <input className={controlClass} name="interview_time" type="time" required defaultValue="10:00" />
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
