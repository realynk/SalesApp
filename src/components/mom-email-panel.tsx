"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import type { LiveSalesCallValues } from "@/lib/live-sales-call";
import { buildMomEmail, momFactsFromLiveCall, type MomFacts } from "@/lib/mom-email";

export function MomEmailPanel({
  contactName,
  companyName,
  industry,
  values,
  getValues,
  framed = true,
}: {
  contactName: string;
  companyName: string;
  industry?: string | null;
  values: LiveSalesCallValues;
  getValues?: () => LiveSalesCallValues;
  framed?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [transcript, setTranscript] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<"fields" | "recording" | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function facts(): MomFacts {
    return momFactsFromLiveCall(getValues?.() ?? values, { contactName, companyName, industry });
  }

  function fromFields() {
    setPending("fields");
    setError(null);
    setWarning(null);
    setEmail(buildMomEmail(facts()));
    setPending(null);
  }

  async function fromRecording() {
    if (!file) {
      setError("Choose a recording first.");
      return;
    }
    setPending("recording");
    setError(null);
    setWarning(null);
    try {
      const body = new FormData();
      body.set("facts", JSON.stringify(facts()));
      body.set("recording", file);
      const response = await fetch("/api/sales-call/mom", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "The recording could not be turned into notes.");
        return;
      }
      setEmail(typeof payload?.email === "string" ? payload.email : "");
      setTranscript(typeof payload?.transcript === "string" ? payload.transcript : "");
      setWarning(typeof payload?.warning === "string" ? payload.warning : null);
    } catch {
      setError("The recording could not be turned into notes.");
    } finally {
      setPending(null);
    }
  }

  async function copyEmail() {
    const text = email.trim() || buildMomEmail(facts());
    if (!email.trim()) setEmail(text);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const busy = Boolean(pending);

  return (
    <div className={framed ? "space-y-3 border-t pt-3" : "space-y-3"}>
      <div>
        <p className="text-sm font-medium">Client MOM email</p>
        <p className="text-xs text-muted-foreground">
          Generate a Gmail-ready recap from the saved call fields, or upload a recording for AI transcription. Nothing is emailed automatically.
        </p>
      </div>
      <Field label="Call recording (optional)">
        <input
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-card file:px-3 file:py-1.5"
          type="file"
          accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.mp4"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={fromFields}>
          {pending === "fields" ? "Building…" : "Generate from call fields"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={fromRecording}>
          {pending === "recording" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Transcribing…
            </span>
          ) : (
            "Transcribe recording"
          )}
        </Button>
        <Button type="button" disabled={busy} onClick={() => void copyEmail()}>
          {copied ? "Copied" : "Copy for Gmail"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {warning ? <p className="text-sm text-muted-foreground">{warning}</p> : null}
      {transcript ? (
        <Field label="Transcript (internal)">
          <textarea className={textareaClass} readOnly value={transcript} rows={4} />
        </Field>
      ) : null}
      <Field label="Minutes of meeting">
        <textarea
          className={textareaClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          rows={14}
          placeholder="Generate the recap, edit if needed, then copy into Gmail."
        />
      </Field>
    </div>
  );
}
