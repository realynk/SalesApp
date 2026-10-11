"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
  INTERVIEW_AVAILABILITY_HINT,
  INTERVIEW_AVAILABILITY_LABEL,
  LIVE_SALES_CALL_FIELDS,
  liveSalesCallIsComplete,
  type LiveSalesCallValues,
} from "@/lib/live-sales-call";
import { saveLiveSalesCallDraft, saveSalesCallCompleteFromBoard } from "@/server/actions";

function BusyStatus({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}

export function LiveSalesCallForm({
  canWrite,
  leadId,
  opportunityId,
  companyName,
  contactName,
  initial,
}: {
  canWrite: boolean;
  leadId: string;
  opportunityId: string;
  companyName: string;
  contactName: string;
  initial: LiveSalesCallValues;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "complete" | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const complete = liveSalesCallIsComplete(initial.status);
  const busy = Boolean(pending) || refreshing;
  const busyLabel = pending === "draft"
    ? "Saving draft…"
    : pending === "complete"
      ? "Marking the call complete…"
      : refreshing
        ? "Loading saved call…"
        : null;

  function fill(formData: FormData) {
    formData.set("lead_id", leadId);
    formData.set("opportunity_id", opportunityId);
    formData.set("company_name", companyName);
    formData.set("client_name", contactName);
  }

  async function saveDraft(formData: FormData) {
    setPending("draft");
    setError(null);
    setNotice(null);
    fill(formData);
    const result = await saveLiveSalesCallDraft(formData);
    if (result?.error) {
      setPending(null);
      setError(result.error);
      return;
    }
    setNotice(result?.success ?? "Draft saved.");
    setPending(null);
    startRefresh(() => {
      router.refresh();
    });
  }

  async function markComplete(formData: FormData) {
    setPending("complete");
    setError(null);
    setNotice(null);
    fill(formData);
    const drafted = await saveLiveSalesCallDraft(formData);
    if (drafted?.error) {
      setPending(null);
      setError(drafted.error);
      return;
    }
    const result = await saveSalesCallCompleteFromBoard(formData);
    if (result?.error) {
      setPending(null);
      setError(result.error);
      return;
    }
    setNotice(result?.success ?? "Sales call marked complete.");
    setPending(null);
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <div id="live-sales-call" className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {complete
          ? "Saved requirements from this call. Candidate interviews are online by default."
          : "Capture requirements while the call is ongoing. Save a draft at any time. Mark complete only when you are ready."}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}
      {busyLabel ? <BusyStatus label={busyLabel} /> : null}
      <form action={canWrite && !complete ? markComplete : saveDraft} aria-busy={busy} className="grid gap-3 md:grid-cols-2">
        <Field label="Call date">
          <input className={controlClass} name="call_on" type="date" defaultValue={initial.callOn} disabled={!canWrite || busy} />
        </Field>
        {LIVE_SALES_CALL_FIELDS.map((field) => {
          const value = initial[field.key];
          const inputClass = field.kind === "textarea" ? textareaClass : controlClass;
          const span = field.kind === "textarea" ? "md:col-span-2" : "";
          return (
            <div key={field.name} className={span}>
              <Field label={field.label}>
                {field.kind === "textarea" ? (
                  <textarea
                    className={inputClass}
                    name={field.name}
                    defaultValue={value}
                    rows={field.key === "interviewAvailability" || field.key === "notes" ? 3 : 2}
                    disabled={!canWrite || busy}
                    placeholder={field.key === "interviewAvailability" ? "Preferred dates, times, and timezone" : undefined}
                  />
                ) : (
                  <input
                    className={inputClass}
                    name={field.name}
                    type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                    defaultValue={value}
                    disabled={!canWrite || busy}
                    step={field.kind === "number" ? "any" : undefined}
                  />
                )}
                {field.key === "interviewAvailability" ? (
                  <p className="mt-1 text-xs text-muted-foreground">{INTERVIEW_AVAILABILITY_HINT}</p>
                ) : null}
              </Field>
            </div>
          );
        })}
        {canWrite ? (
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" formAction={saveDraft} variant="outline" disabled={busy}>
              {pending === "draft" ? "Saving draft…" : complete ? "Save updates" : "Save draft"}
            </Button>
            {complete ? null : (
              <Button type="submit" disabled={busy}>
                {pending === "complete" ? "Marking complete…" : "Mark sales call complete"}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground md:col-span-2">
            {INTERVIEW_AVAILABILITY_LABEL} and the other requirements below are saved from the live call.
          </p>
        )}
      </form>
    </div>
  );
}
