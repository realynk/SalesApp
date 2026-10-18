"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { buildSalesProfileEmail } from "@/lib/gmail/profile-email";
import { MANUAL_SALES_PROFILE_SENT_CONFIRM } from "@/lib/sales-profile-send";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import {
  loadGmailStatus,
  loadSalesProfileEmailContext,
  markSalesProfileSentFromBoard,
  saveSalesProfileEmailDraft,
  sendProfileEmailAndRecord,
  type GmailStatus,
  type SalesProfileEmailContext,
} from "@/server/actions";

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
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      {draft ? (
        <ProfileSendForm
          key={`${draft.leadId}:${draft.opportunityId ?? ""}`}
          draft={draft}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function ProfileSendForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: ProfileSendDraft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [facts, setFacts] = useState<SalesProfileEmailContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSalesProfileEmailContext(draft.leadId, draft.opportunityId).then((result) => {
      if (!cancelled) setFacts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.leadId, draft.opportunityId]);

  if (!facts) {
    return (
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sent sales profiles to the client</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading the email draft…
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    );
  }

  return <ProfileSendComposer draft={draft} facts={facts} onCancel={onCancel} onSaved={onSaved} />;
}

function ProfileSendComposer({
  draft,
  facts,
  onCancel,
  onSaved,
}: {
  draft: ProfileSendDraft;
  facts: SalesProfileEmailContext;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = todayInWorkflowZone();
  const template = buildSalesProfileEmail({
    contactName: draft.contactName,
    clientFirstName: facts.clientFirstName,
    outreachFirstName: facts.outreachFirstName,
    companyName: draft.companyName,
    toEmail: facts.toEmail || draft.email,
  });
  const [error, setError] = useState<string | null>(facts.error);
  const [pending, setPending] = useState<"save" | "send" | "manual" | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [to, setTo] = useState(facts.savedTo || template.to);
  const [cc, setCc] = useState(facts.savedCc || "");
  const [subject, setSubject] = useState(facts.savedSubject || template.subject);
  const [body, setBody] = useState(facts.savedBody || template.body);
  const [manualOutside, setManualOutside] = useState(false);
  const [manualSentOn, setManualSentOn] = useState(today);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadGmailStatus().then((status) => {
      if (cancelled) return;
      setGmail(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function fillIdentity(formData: FormData) {
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    formData.set("client_email", to);
    formData.set("gmail_from", gmail?.email ?? "");
    formData.set("gmail_to", to);
    formData.set("gmail_cc", cc);
    formData.set("gmail_subject", subject);
    formData.set("gmail_body", body);
  }

  async function runOnce(kind: "save" | "send" | "manual", work: () => Promise<{ error?: string } | null | undefined | void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(kind);
    setError(null);
    try {
      const result = await work();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved();
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function handleSave(formData: FormData) {
    await runOnce("save", async () => {
      fillIdentity(formData);
      return saveSalesProfileEmailDraft(formData);
    });
  }

  async function handleSend(formData: FormData) {
    await runOnce("send", async () => {
      fillIdentity(formData);
      formData.set("gmail_confirm", "send");
      return sendProfileEmailAndRecord(formData);
    });
  }

  async function handleMarkOutside(formData: FormData) {
    await runOnce("manual", async () => {
      fillIdentity(formData);
      formData.set("send_outcome", "manual");
      formData.set("manual_sent_confirm", MANUAL_SALES_PROFILE_SENT_CONFIRM);
      formData.set("profile_sent_on", manualSentOn);
      return markSalesProfileSentFromBoard(formData);
    });
  }

  const busy = Boolean(pending);
  const connectedFrom = gmail?.email ?? "";
  const statusLabel = pending === "send" ? "Sending the email. Please wait…" : pending === "save" ? "Saving the draft…" : pending === "manual" ? "Saving…" : null;

  return (
    <DialogContent
      className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      showCloseButton={!busy}
      onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
      onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
    >
      <DialogHeader>
        <DialogTitle>Sent sales profiles to the client</DialogTitle>
        <DialogDescription>
          {`${draft.contactName} at ${draft.companyName}. Saving a draft does not mark the profiles as emailed. Follow-ups start only after Gmail sends or you confirm a send outside SalesApp.`}
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" aria-busy={busy}>
        {statusLabel ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {statusLabel}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {gmail?.message ? <p className="text-sm text-muted-foreground">{gmail.message}</p> : null}
        {gmail?.connected ? (
          <p className="text-xs text-muted-foreground">Connected as {gmail.email}. Nothing is sent until you click Send email.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" asChild>
              <a href="/api/gmail/connect?next=/opportunities">Connect Gmail</a>
            </Button>
            <p className="text-xs text-muted-foreground">You can save a draft without emailing.</p>
          </div>
        )}
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Email to review</p>
          <Field label="From">
            <input
              className={controlClass}
              value={connectedFrom}
              readOnly
              aria-readonly="true"
              placeholder="Connect Gmail to set From"
              disabled={busy}
            />
          </Field>
          <Field label="To">
            <input className={controlClass} name="client_email" type="email" required value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@client.com" disabled={busy} />
          </Field>
          <Field label="CC">
            <input className={controlClass} value={cc} onChange={(event) => setCc(event.target.value)} placeholder="optional@company.com" disabled={busy} />
          </Field>
          <Field label="Subject">
            <input className={controlClass} value={subject} onChange={(event) => setSubject(event.target.value)} disabled={busy} />
          </Field>
          <Field label="Body">
            <textarea className={`${textareaClass} min-h-56`} value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} />
            <p className="text-xs text-muted-foreground">Profile and calendar links stay clickable when Gmail sends. You can edit every field before sending.</p>
          </Field>
        </div>
        <Field label="Internal notes (optional)">
          <textarea className={textareaClass} name="notes" placeholder="What you sent or what to confirm later" disabled={busy} />
        </Field>
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={manualOutside}
              disabled={busy}
              onChange={(event) => setManualOutside(event.target.checked)}
            />
            <span>I sent this email outside SalesApp</span>
          </label>
          {manualOutside ? (
            <Field label="Actual send date">
              <input className={controlClass} type="date" value={manualSentOn} onChange={(event) => setManualSentOn(event.target.value)} disabled={busy} />
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="outline" disabled={busy} formAction={handleSave}>
            <PendingLabel active={pending === "save"} idle="Save without sending" busy="Saving…" />
          </Button>
          {manualOutside ? (
            <Button type="submit" disabled={busy} formAction={handleMarkOutside}>
              <PendingLabel active={pending === "manual"} idle="Mark as sent outside SalesApp" busy="Saving…" />
            </Button>
          ) : (
            <Button type="submit" disabled={busy || !gmail?.connected} formAction={handleSend} aria-busy={pending === "send"}>
              <PendingLabel active={pending === "send"} idle="Send email" busy="Sending…" />
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PendingLabel({ active, idle, busy }: { active: boolean; idle: string; busy: string }) {
  if (!active) return idle;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {busy}
    </span>
  );
}
