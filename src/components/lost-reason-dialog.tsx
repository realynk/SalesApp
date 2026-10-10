"use client";

import { useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LOST_REASONS } from "@/lib/domain";
import { saveLostFromBoard } from "@/server/actions";

export function LostReasonDialog({
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
    const result = await saveLostFromBoard(formData);
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
          <DialogTitle>Why was this opportunity lost?</DialogTitle>
          <DialogDescription>{draft ? draft.companyName : ""}</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Reason">
            <select className={controlClass} name="lost_reason" required defaultValue="">
              <option value="" disabled>Choose a reason</option>
              {LOST_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </Field>
          <Field label="Explanation (optional)">
            <textarea className={textareaClass} name="note" placeholder="Anything the team should remember" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Mark lost"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
