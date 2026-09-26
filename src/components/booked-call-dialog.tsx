"use client";

import { useState } from "react";
import { AccountFlagSelect } from "@/components/account-flag-field";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
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
  const today = new Date().toISOString().slice(0, 10);

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
            {draft ? `When was the meeting booked with ${draft.contactName} at ${draft.companyName}? It is added to reminders and tasks.` : ""}
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
          <Field label="Flag">
            <AccountFlagSelect defaultValue={draft?.accountFlag ?? null} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save and add reminder"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
