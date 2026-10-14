"use client";

import { useEffect, useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { loadBoardWorkContext, saveInterviewOutcomeFromBoard } from "@/server/actions";

export function InterviewOutcomeDialog({
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
  const [selected, setSelected] = useState("no");
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
    formData.set("client_name", draft.contactName);
    const result = await saveInterviewOutcomeFromBoard(formData);
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
          <DialogTitle>Interview complete</DialogTitle>
          <DialogDescription>Has the client selected a candidate?</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Candidate selected?">
            <select className={controlClass} name="selected" required value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          {selected === "yes" ? (
            candidates.length > 0 ? (
              <Field label="Selected candidate">
                <select className={controlClass} name="candidate_id" required defaultValue="">
                  <option value="" disabled>Choose the candidate</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Selected candidate">
                <input className={controlClass} name="candidate_name" required placeholder="Full name" />
              </Field>
            )
          ) : null}
          <Field label="Interview date">
            <input className={controlClass} name="interview_on" type="date" required defaultValue={todayInWorkflowZone()} />
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
