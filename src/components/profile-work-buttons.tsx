"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TalentRequestDialog } from "@/components/talent-request-dialog";
import { CandidateProfilesSentDialog } from "@/components/candidate-profiles-sent-dialog";
import { InterviewScheduledDialog } from "@/components/interview-scheduled-dialog";
import { InterviewOutcomeDialog } from "@/components/interview-outcome-dialog";
import { BookedCallDialog } from "@/components/booked-call-dialog";
import { ProfileSendDialog } from "@/components/profile-send-dialog";
import { SalesCallCompleteDialog } from "@/components/sales-call-complete-dialog";
import { SowTransitionDialog } from "@/components/sow-transition-dialog";
import { ClientStartDialog } from "@/components/client-start-dialog";
import { LostReasonDialog } from "@/components/lost-reason-dialog";
import { NurtureDialog } from "@/components/nurture-dialog";

type Kind =
  | "sales-profiles"
  | "booked-call"
  | "call-complete"
  | "talent"
  | "candidate-profiles"
  | "interview"
  | "interview-outcome"
  | "sow-prep"
  | "sow-signed"
  | "client-start"
  | "lost"
  | "nurture";

export function ProfileWorkButtons({
  leadId,
  opportunityId,
  companyName,
  contactName,
}: {
  leadId: string;
  opportunityId: string;
  companyName: string;
  contactName: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const draft = { leadId, opportunityId, companyName, contactName, email: null, accountFlag: null };
  const close = () => setKind(null);
  const saved = () => {
    setKind(null);
    router.refresh();
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("sales-profiles")}>Record sales profiles sent</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("booked-call")}>Book sales call</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("call-complete")}>Complete sales call</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("talent")}>Talent request</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("candidate-profiles")}>Candidate profiles sent</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("interview")}>Schedule interview</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("interview-outcome")}>Interview complete</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("sow-prep")}>Update SOW</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("sow-signed")}>SOW signed</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("client-start")}>Record client start</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("nurture")}>On hold</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setKind("lost")}>Mark lost</Button>
      <ProfileSendDialog draft={kind === "sales-profiles" ? draft : null} onCancel={close} onSaved={saved} />
      <BookedCallDialog draft={kind === "booked-call" ? draft : null} onCancel={close} onSaved={saved} />
      <SalesCallCompleteDialog draft={kind === "call-complete" ? draft : null} onCancel={close} onSaved={saved} />
      <TalentRequestDialog draft={kind === "talent" ? draft : null} onCancel={close} onSaved={saved} />
      <CandidateProfilesSentDialog draft={kind === "candidate-profiles" ? draft : null} onCancel={close} onSaved={saved} />
      <InterviewScheduledDialog draft={kind === "interview" ? draft : null} onCancel={close} onSaved={saved} />
      <InterviewOutcomeDialog draft={kind === "interview-outcome" ? draft : null} onCancel={close} onSaved={saved} />
      <SowTransitionDialog draft={kind === "sow-prep" || kind === "sow-signed" ? { ...draft, kind } : null} onCancel={close} onSaved={saved} />
      <ClientStartDialog draft={kind === "client-start" ? draft : null} onCancel={close} onSaved={saved} />
      <NurtureDialog draft={kind === "nurture" ? draft : null} onCancel={close} onSaved={saved} />
      <LostReasonDialog draft={kind === "lost" ? draft : null} onCancel={close} onSaved={saved} />
    </>
  );
}
