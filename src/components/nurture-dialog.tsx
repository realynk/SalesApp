"use client";

import { useState } from "react";
import { controlClass, textareaClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addCalendarDays, todayInWorkflowZone } from "@/lib/workflow-dates";
import { saveNurtureFromBoard } from "@/server/actions";

const CHECK_BACK_PRESETS = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
] as const;

export function NurtureDialog({
  draft,
  onCancel,
  onSaved,
}: {
  draft: { leadId: string; opportunityId: string | null; companyName: string; contactName?: string } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkBackOn, setCheckBackOn] = useState("");
  const today = todayInWorkflowZone();
  const who = draft?.contactName?.trim() || draft?.companyName || "this client";

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    if (checkBackOn) formData.set("check_back_on", checkBackOn);
    const result = await saveNurtureFromBoard(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setCheckBackOn("");
    onSaved();
  }

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setCheckBackOn("");
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Move to nurture</DialogTitle>
          <DialogDescription>
            Optionally pick when to contact {who} again. If you skip it, 30-, 60-, and 90-day check-ins are added automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Why is this on hold? (optional)">
            <textarea className={textareaClass} name="note" placeholder="Timing, budget, or a later revisit" />
          </Field>
          <Field label="When should we contact them back? (optional)">
            <input
              className={controlClass}
              name="check_back_on"
              type="date"
              min={today}
              value={checkBackOn}
              onChange={(event) => setCheckBackOn(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {CHECK_BACK_PRESETS.map((preset) => {
                const value = addCalendarDays(today, preset.days);
                return (
                  <Button
                    key={preset.days}
                    type="button"
                    size="sm"
                    variant={checkBackOn === value ? "default" : "outline"}
                    disabled={pending}
                    onClick={() => setCheckBackOn(value)}
                  >
                    {preset.label}
                  </Button>
                );
              })}
              {checkBackOn ? (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setCheckBackOn("")}>
                  Clear
                </Button>
              ) : null}
            </div>
            {checkBackOn ? (
              <p className="mt-2 text-xs text-muted-foreground">A reminder will be scheduled for that day on Attention and the week calendar.</p>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setCheckBackOn(""); onCancel(); }}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
