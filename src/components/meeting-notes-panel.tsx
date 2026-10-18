"use client";

import { MomEmailPanel } from "@/components/mom-email-panel";
import { emptyLiveSalesCallValues, type LiveSalesCallValues } from "@/lib/live-sales-call";

export function MeetingNotesPanel({
  clientName,
  companyName,
  industry,
  values,
}: {
  clientName: string;
  companyName: string;
  industry?: string | null;
  values?: LiveSalesCallValues | null;
}) {
  return (
    <MomEmailPanel
      contactName={clientName}
      companyName={companyName}
      industry={industry}
      values={values ?? emptyLiveSalesCallValues()}
      framed={false}
    />
  );
}
