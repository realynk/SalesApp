"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { controlClass } from "@/components/bits";
import {
  NOT_INTERESTED_OUTCOMES,
  SENDPILOT_STATUSES,
  type NotInterestedOutcome,
  type SendPilotStatus,
} from "@/lib/domain";
import { updateLeadStatusFromList } from "@/server/actions";

function stopRowEvents(event: SyntheticEvent) {
  event.stopPropagation();
}

export function SendPilotStatusControl({
  leadId,
  status,
  outcome,
  readOnly = false,
}: {
  leadId: string;
  status: SendPilotStatus | null;
  outcome: NotInterestedOutcome | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<SendPilotStatus | "">(status ?? "");
  const [currentOutcome, setCurrentOutcome] = useState<NotInterestedOutcome | "">(outcome ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (readOnly) {
    return (
      <div className="min-w-[9.5rem] text-sm">
        <p>{status ?? "Unknown"}</p>
        {status === "Not Interested" ? (
          <p className="text-xs text-muted-foreground">{outcome ?? "Not yet sorted"}</p>
        ) : null}
      </div>
    );
  }

  async function persist(nextStatus: SendPilotStatus | "", nextOutcome: NotInterestedOutcome | "") {
    const previousStatus = currentStatus;
    const previousOutcome = currentOutcome;
    setCurrentStatus(nextStatus);
    setCurrentOutcome(nextStatus === "Not Interested" ? nextOutcome : "");
    setPending(true);
    const formData = new FormData();
    formData.set("lead_id", leadId);
    formData.set("sendpilot_status", nextStatus);
    formData.set("not_interested_outcome", nextStatus === "Not Interested" ? nextOutcome : "");
    const result = await updateLeadStatusFromList(formData);
    setPending(false);
    if (result?.error) {
      setCurrentStatus(previousStatus);
      setCurrentOutcome(previousOutcome);
      setError(result.error);
      return;
    }
    setError(null);
    router.refresh();
  }

  return (
    <div
      className="min-w-[9.5rem] space-y-1"
      onPointerDown={stopRowEvents}
      onClick={stopRowEvents}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.preventDefault();
      }}
    >
      <select
        aria-label="SendPilot status"
        className={`${controlClass} h-8 text-xs`}
        disabled={pending}
        value={currentStatus}
        onChange={(event) => {
          const next = event.target.value as SendPilotStatus | "";
          void persist(next, next === "Not Interested" ? currentOutcome : "");
        }}
      >
        <option value="">Unknown</option>
        {SENDPILOT_STATUSES.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      {currentStatus === "Not Interested" ? (
        <select
          aria-label="Not Interested reason"
          className={`${controlClass} h-8 text-xs`}
          disabled={pending}
          value={currentOutcome}
          onChange={(event) => {
            void persist("Not Interested", event.target.value as NotInterestedOutcome | "");
          }}
        >
          <option value="">Not yet sorted</option>
          {NOT_INTERESTED_OUTCOMES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
