"use client";

import { useMemo, useState } from "react";
import { controlClass, Field, textareaClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { profileSendCheckBacks } from "@/lib/domain";
import { saveProfileSendFromBoard } from "@/server/actions";

export type ProfileSendDraft = {
  leadId: string;
  opportunityId: string | null;
  companyName: string;
  contactName: string;
  email: string | null;
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
  const today = new Date().toISOString().slice(0, 10);
  const [sentOn, setSentOn] = useState(today);
  const [callOn, setCallOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const defaults = useMemo(() => profileSendCheckBacks(callOn || null, sentOn || today), [callOn, sentOn, today]);
  const [checkOne, setCheckOne] = useState(defaults.oneDay);
  const [checkTwo, setCheckTwo] = useState(defaults.twoDays);
  const [lastBase, setLastBase] = useState(`${callOn}|${sentOn}`);
  const base = `${callOn}|${sentOn}`;
  if (base !== lastBase) {
    setLastBase(base);
    setCheckOne(defaults.oneDay);
    setCheckTwo(defaults.twoDays);
  }

  async function handleSubmit(formData: FormData) {
    if (!draft) return;
    setPending(true);
    setError(null);
    formData.set("lead_id", draft.leadId);
    if (draft.opportunityId) formData.set("opportunity_id", draft.opportunityId);
    formData.set("company_name", draft.companyName);
    formData.set("client_name", draft.contactName);
    const result = await saveProfileSendFromBoard(formData);
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
          <DialogTitle>Sent profiles to the client</DialogTitle>
          <DialogDescription>
            {draft ? `${draft.contactName} at ${draft.companyName}. These dates land on the week calendar.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field label="Client email they provided">
            <input className={controlClass} name="client_email" type="email" required defaultValue={draft?.email ?? ""} placeholder="name@client.com" />
          </Field>
          <Field label="When was the email/profiles sent?">
            <input className={controlClass} name="profile_sent_on" type="date" required value={sentOn} onChange={(event) => setSentOn(event.target.value)} />
          </Field>
          <Field label="When I scheduled the call">
            <input className={controlClass} name="call_on" type="date" value={callOn} onChange={(event) => setCallOn(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Check back (1 day from the call)">
              <input className={controlClass} name="check_back_1" type="date" required value={checkOne} onChange={(event) => setCheckOne(event.target.value)} />
            </Field>
            <Field label="Check back (2 days from the call)">
              <input className={controlClass} name="check_back_2" type="date" required value={checkTwo} onChange={(event) => setCheckTwo(event.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={textareaClass} name="notes" placeholder="What you sent, what they asked for, or what to confirm on the call" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save and move"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
