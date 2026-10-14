"use client";

import { useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { saveBookedSalesCallFromBoard } from "@/server/actions";

export type BookedCallDraft = {
  leadId: string;
  opportunityId: string | null;
  companyName: string;
  contactName: string;
  accountFlag: AccountFlag | null;
};

export function BookedCallDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: BookedCallDraft | null;
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
    const result = await saveBookedSalesCallFromBoard(formData);
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
          <DialogTitle>Booked sales call</DialogTitle>
          <DialogDescription>
            {draft ? `When is the meeting with ${draft.contactName} at ${draft.companyName}? Prep tasks and the meeting-day reminder are added automatically.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Meeting date">
            <input className={controlClass} name="call_on" type="date" required defaultValue={today} />
          </Field>
          <Field label="Meeting time">
            <input className={controlClass} name="call_time" type="time" required defaultValue="10:00" />
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
