"use client";

import { useMemo, useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { startMeetingNotes } from "@/lib/google-meet-notes";

export function MeetingNotesPanel({
  clientName,
  companyName,
}: {
  clientName: string;
  companyName: string;
}) {
  const [internalNotes, setInternalNotes] = useState("");
  const [clientSummary, setClientSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const preview = useMemo(
    () => clientSummary.trim() || `Hi — here is a short recap of our conversation with ${clientName} at ${companyName}.`,
    [clientName, clientSummary, companyName],
  );

  function generate() {
    const result = startMeetingNotes({
      userRequested: true,
      recordingAvailable: false,
      permissionGranted: false,
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setInternalNotes(result.internalNotes);
    setClientSummary(result.clientSummary);
    setMessage(null);
  }

  async function copySummary() {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Recordings stay in Google Meet until this workspace is authorized. Generate notes only after a recording is available. Nothing is emailed automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={generate}>Generate meeting notes</Button>
        <Button type="button" variant="outline" onClick={copySummary}>{copied ? "Copied" : "Copy text"}</Button>
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Field label="Internal meeting notes">
        <textarea className={textareaClass} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Requirements, headcount, schedule, budget, decisions, next steps" rows={6} />
      </Field>
      <Field label="Client-friendly summary">
        <textarea className={textareaClass} value={clientSummary} onChange={(event) => setClientSummary(event.target.value)} placeholder="A concise recap you can paste into Gmail" rows={5} />
      </Field>
      <Field label="Preview">
        <textarea className={controlClass} readOnly value={preview} rows={3} />
      </Field>
    </div>
  );
}
