import Link from "next/link";
import { Notice, PageHeader, StageBadge } from "@/components/bits";
import { SubmitButton } from "@/components/forms";
import { getCommandCenter, listFollowUps } from "@/lib/data";
import { firstParam, formatDate } from "@/lib/format";
import { completeFollowUp } from "@/server/actions";

export default async function NurturePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [center, followUps] = await Promise.all([getCommandCenter(), listFollowUps("open")]);
  const accounts = center.opportunities
    .filter((opportunity) => opportunity.status === "nurture" || opportunity.stage === "On Hold / Nurture")
    .map((opportunity) => ({
      opportunity,
      followUp: followUps.find((item) => item.opportunityId === opportunity.id) ?? null,
    }))
    .sort((a, b) => (a.followUp?.dueOn ?? a.opportunity.nextActionDate ?? "9999").localeCompare(b.followUp?.dueOn ?? b.opportunity.nextActionDate ?? "9999"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Nurture"
        description="Held accounts keep a reason, a next date, and notes. SendPilot Not Interested leads start on the Not Interested column of the client journey board, then sort into Nurture or another reason."
      />
      <Notice message={firstParam(query.notice)} />
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {accounts.map(({ opportunity, followUp }) => {
          const dueOn = followUp?.dueOn ?? opportunity.nextActionDate;
          const reason = opportunity.nurtureReason ?? followUp?.reason;
          const notes = opportunity.nurtureNotes ?? followUp?.notes;
          return (
            <li key={opportunity.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-medium" href={`/opportunities/${opportunity.id}?tab=follow-ups`}>{opportunity.companyName}</Link>
                  <StageBadge stage={opportunity.stage} />
                </div>
                <p className="mt-1 text-muted-foreground">{opportunity.contactName}</p>
                <p className="mt-2">{followUp?.title ?? opportunity.nextAction ?? "Set the next nurture date"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reason ? `Reason: ${reason}` : "No reason yet"}
                  {" · "}
                  Next date: {formatDate(dueOn)}
                </p>
                {notes ? <p className="mt-2 max-w-2xl text-sm leading-6">{notes}</p> : null}
              </div>
              {followUp ? (
                <form action={completeFollowUp}>
                  <input type="hidden" name="follow_up_id" value={followUp.id} />
                  <input type="hidden" name="opportunity_id" value={opportunity.id} />
                  <SubmitButton variant="outline">Complete</SubmitButton>
                </form>
              ) : null}
            </li>
          );
        })}
        {accounts.length === 0 ? <li className="px-4 py-8 text-sm text-muted-foreground">No accounts are in nurture.</li> : null}
      </ul>
    </div>
  );
}
