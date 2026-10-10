"use client";

import { useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { saveProfileSendFromBoard } from "@/server/actions";

export type ProfileSendDraft = {
  leadId: string;
  opportunityId: string | null;
  companyName: string;
  contactName: string;
  email: string | null;
  accountFlag: AccountFlag | null;
};

export function ProfileSendDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: ProfileSendDraft | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = todayInWorkflowZone();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    const result = await saveProfileSendFromBoard(formData);
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
          <DialogTitle>Sent sales profiles to the client</DialogTitle>
          <DialogDescription>
            {draft
              ? `${draft.contactName} at ${draft.companyName}. This is the first sales/VA introduction, not candidate profiles. Follow-ups are scheduled 3, 5, and 7 business days after the send date.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Client email">
            <input className={controlClass} name="client_email" type="email" required defaultValue={draft?.email ?? ""} placeholder="name@client.com" />
          </Field>
          <Field label="When were the sales profiles sent?">
            <input className={controlClass} name="profile_sent_on" type="date" required defaultValue={today} />
          </Field>
          <Field label="Proposal call date (optional)">
            <input className={controlClass} name="call_on" type="date" />
          </Field>
          <Field label="Notes (optional)">
            <textarea className={textareaClass} name="notes" placeholder="What you sent or what to confirm later" />
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
