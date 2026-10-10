import { AttentionList, PageHeader, SectionCard } from "@/components/bits";
import { SubmitButton } from "@/components/forms";
import { getCommandCenter } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { completeFollowUp } from "@/server/actions";
import { profileCanWrite, requireUser } from "@/server/session";

const GROUPS = [
  ["needs", "Overdue and needs attention"],
  ["today", "Due today"],
  ["upcoming", "Pending follow-ups"],
  ["waiting_client", "Awaiting client action"],
  ["waiting_recruitment", "Recruitment follow-ups"],
  ["stale", "Stale"],
  ["at_risk", "At risk"],
] as const;

export default async function NotificationsPage() {
  const [center, session] = await Promise.all([getCommandCenter(), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
  const urgent = center.schedule.followUps.filter((item) => item.urgent);
  const pendingSchedule = center.schedule.followUps.filter((item) => item.pendingSchedule);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="In-app" title="Attention" description="These are calculated from the live pipeline. Completing a task here updates the same list used on the calendar and profiles." />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Urgent">
          <FollowUpActions items={urgent} canWrite={canWrite} empty="Nothing urgent." />
        </SectionCard>
        <SectionCard title="Needs scheduling">
          <FollowUpActions items={pendingSchedule} canWrite={canWrite} empty="Nothing waiting to be scheduled." />
        </SectionCard>
        {GROUPS.map(([key, label]) => (
          <SectionCard key={key} title={label}>
            <AttentionList items={center.attention.filter((item) => item.sections.includes(key))} empty="Nothing in this queue." />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

function FollowUpActions({
  items,
  canWrite,
  empty,
}: {
  items: Array<{ id: string; title: string; dueOn: string; companyName: string; opportunityId?: string | null; leadId?: string | null }>;
  canWrite: boolean;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-3 py-3">
          <span>
            <span className="font-medium">{item.title}</span>
            <p className="text-xs text-muted-foreground">{item.companyName} · {formatDate(item.dueOn)}</p>
          </span>
          {canWrite ? (
            <form action={completeFollowUp}>
              <input type="hidden" name="follow_up_id" value={item.id} />
              {item.opportunityId ? <input type="hidden" name="opportunity_id" value={item.opportunityId} /> : null}
              {item.leadId ? <input type="hidden" name="lead_id" value={item.leadId} /> : null}
              <SubmitButton variant="outline">Done</SubmitButton>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
