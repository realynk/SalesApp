"use client";

import { useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveSowFromBoard } from "@/server/actions";

export function SowTransitionDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: { kind: "sow-prep" | "sow-signed"; leadId: string; opportunityId: string | null; companyName: string } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const prep = draft?.kind === "sow-prep";

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("kind", draft.kind);
    const result = await saveSowFromBoard(formData);
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
          <DialogTitle>{prep ? "SOW prep / sent" : "SOW signed"}</DialogTitle>
          <DialogDescription>
            {prep
              ? "Target client start date is optional. Choose Not confirmed yet if it is still unknown."
              : "Optional signed date. HR and onboarding tasks are created automatically."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {prep ? (
            <>
              <Field label="Target start date">
                <input className={controlClass} name="target_start_on" type="date" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="start_confirmed" value="no" defaultChecked />
                Not confirmed yet
              </label>
            </>
          ) : (
            <Field label="Signed date (optional)">
              <input className={controlClass} name="sow_signed_on" type="date" />
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
