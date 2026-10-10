"use client";

import { useEffect, useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import { loadTalentRequestDraft, markTalentRequestSent, saveTalentRequestDraft } from "@/server/actions";

export function TalentRequestDialog({
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
  const [body, setBody] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [sentOn, setSentOn] = useState<string | null>(null);
  const [sentDate, setSentDate] = useState(todayInWorkflowZone());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    void loadTalentRequestDraft(draft.leadId, draft.opportunityId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("body" in result && result.body != null) {
        setBody(result.body);
        setMissing(result.missing ?? []);
        setSentOn(result.sentOn ?? null);
        if (result.sentOn) setSentDate(result.sentOn);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  async function save(markSent: boolean) {
    if (!draft) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("draft_body", body);
    formData.set("sent_on", sentDate);
    const result = markSent ? await markTalentRequestSent(formData) : await saveTalentRequestDraft(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Talent request</DialogTitle>
          <DialogDescription>
            {sentOn ? "This request is marked Sent." : "This request is a Draft until you mark it sent. Nothing is emailed automatically."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {missing.length > 0 ? (
            <p className="text-sm text-muted-foreground">Still needed: {missing.join(", ")}. Missing details were not invented.</p>
          ) : null}
          <Field label="Email draft">
            <textarea className={`${textareaClass} min-h-56`} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <Field label="Sent date">
            <input className={controlClass} type="date" value={sentDate} onChange={(event) => setSentDate(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyEmail}>{copied ? "Copied" : "Copy email"}</Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void save(false)}>{pending ? "Saving…" : "Save draft"}</Button>
          <Button type="button" disabled={pending} onClick={() => void save(true)}>Mark sent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
