"use client";

import { useState } from "react";
import { AccountFlagSelect } from "@/components/account-flag-field";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SALES_CALL_COMPLETE_TASKS, type AccountFlag } from "@/lib/domain";
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
  const today = new Date().toISOString().slice(0, 10);

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
              ? `After the call with ${draft.contactName} at ${draft.companyName}, these tasks are added to reminders.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="When the call happened">
            <input className={controlClass} name="call_on" type="date" required defaultValue={today} />
          </Field>
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Tasks to add</p>
            <ol className="space-y-3">
              {SALES_CALL_COMPLETE_TASKS.map((title, index) => (
                <li key={title} className="grid gap-2">
                  <p className="text-sm font-medium">{index + 1}. {title}</p>
                  <Field label="Due">
                    <input className={controlClass} name={`task_due_${index}`} type="date" required defaultValue={today} />
                  </Field>
                </li>
              ))}
            </ol>
          </div>
          <Field label="Flag">
            <AccountFlagSelect defaultValue={draft?.accountFlag ?? null} />
          </Field>
          <Field label="Notes">
            <textarea className={textareaClass} name="notes" placeholder="What to send, who to include on the GC, or anything recruitment needs" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save and add tasks"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
