"use client";

import { useEffect, useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountFlag } from "@/lib/domain";
import { buildSalesProfileEmail } from "@/lib/gmail/profile-email";
import { todayInWorkflowZone } from "@/lib/workflow-dates";
import {
  loadGmailStatus,
  saveProfileSendFromBoard,
  sendProfileEmailAndRecord,
  type GmailStatus,
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
  const today = todayInWorkflowZone();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "send" | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!draft) return;
    const template = buildSalesProfileEmail({
      contactName: draft.contactName,
      companyName: draft.companyName,
      toEmail: draft.email,
      senderName: gmail?.senderName,
      fromEmail: gmail?.email,
    });
    setTo(template.to);
    setSubject(template.subject);
    setBody(template.body);
    setCc("");
    setFrom(gmail?.fromAddresses[0] || gmail?.email || "");
    setError(null);
    let cancelled = false;
    void loadGmailStatus().then((status) => {
      if (cancelled) return;
      setGmail(status);
      const next = buildSalesProfileEmail({
        contactName: draft.contactName,
        companyName: draft.companyName,
        toEmail: draft.email,
        senderName: status.senderName,
        fromEmail: status.email,
      });
      setFrom(status.fromAddresses[0] || status.email || "");
      setTo((current) => current || next.to);
      setSubject(next.subject);
      setBody(next.body);
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  async function handleSave(formData: FormData) {
    if (!draft) return;
    setPending("save");
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    formData.set("client_email", to || String(formData.get("client_email") ?? ""));
    const result = await saveProfileSendFromBoard(formData);
    setPending(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function handleSend(formData: FormData) {
    if (!draft) return;
    setPending("send");
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    formData.set("client_email", to);
    formData.set("gmail_from", from);
    formData.set("gmail_to", to);
    formData.set("gmail_cc", cc);
    formData.set("gmail_subject", subject);
    formData.set("gmail_body", body);
    formData.set("gmail_confirm", "send");
    const result = await sendProfileEmailAndRecord(formData);
    setPending(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  const busy = Boolean(pending);
  const fromOptions = gmail?.fromAddresses?.length ? gmail.fromAddresses : from ? [from] : [];

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Sent sales profiles to the client</DialogTitle>
          <DialogDescription>
            {draft
              ? `${draft.contactName} at ${draft.companyName}. Review the email below before anything is sent. Follow-ups are scheduled 3, 5, and 7 business days after the send date.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {gmail?.message ? <p className="text-sm text-muted-foreground">{gmail.message}</p> : null}
          {gmail?.connected ? (
            <p className="text-xs text-muted-foreground">Connected as {gmail.email}. Nothing is sent until you click Send email.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" asChild>
                <a href="/api/gmail/connect?next=/opportunities">Connect Gmail</a>
              </Button>
              <p className="text-xs text-muted-foreground">You can still save the send in SalesApp without emailing.</p>
            </div>
          )}
          <Field label="When were the sales profiles sent?">
            <input className={controlClass} name="profile_sent_on" type="date" required defaultValue={today} disabled={busy} />
          </Field>
          <div className="grid gap-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Email to review</p>
            <Field label="From">
              {fromOptions.length > 1 ? (
                <select className={controlClass} value={from} onChange={(event) => setFrom(event.target.value)} disabled={busy}>
                  {fromOptions.map((address) => (
                    <option key={address} value={address}>{address}</option>
                  ))}
                </select>
              ) : (
                <input className={controlClass} value={from} onChange={(event) => setFrom(event.target.value)} placeholder="you@realynk.com" disabled={busy} />
              )}
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
              <textarea className={`${textareaClass} min-h-40`} value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} />
            </Field>
          </div>
          <Field label="Internal notes (optional)">
            <textarea className={textareaClass} name="notes" placeholder="What you sent or what to confirm later" disabled={busy} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="outline" disabled={busy} formAction={handleSave}>
              {pending === "save" ? "Saving…" : "Save without sending"}
            </Button>
            <Button type="submit" disabled={busy || !gmail?.connected} formAction={handleSend}>
              {pending === "send" ? "Sending…" : "Send email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
