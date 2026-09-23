import Link from "next/link";
import { AttentionList, EmptyState, KpiCard, Notice, PageHeader, SectionCard, StageBadge } from "@/components/bits";
import { WeekCalendar } from "@/components/week-calendar";
import { Button } from "@/components/ui/button";
import { buildWeekTasks } from "@/lib/domain";
import { getCommandCenter } from "@/lib/data";
import { formatDate, formatMoney, firstParam } from "@/lib/format";
import { loadSampleWorkspace } from "@/server/actions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string; week?: string }> }) {
  const query = await searchParams;
  const center = await getCommandCenter();
  const weekTasks = buildWeekTasks({
    today: center.today,
    staleAfterDays: center.settings.staleAfterDays,
    profilesWaitingDays: center.settings.profilesWaitingDays,
    approachingWindowDays: center.settings.approachingWindowDays,
    opportunities: center.schedule.opportunities,
    followUps: center.schedule.followUps,
    profileBatches: center.schedule.profileBatches,
    recruitment: center.schedule.recruitment,
    interviews: center.schedule.interviews,
    contracts: center.schedule.contracts,
    strategyCalls: center.schedule.strategyCalls,
    unmatchedInterested: [],
  });
  const needs = center.attention.filter((item) => item.sections.includes("needs")).slice(0, 8);
  const today = center.attention.filter((item) => item.sections.includes("today")).slice(0, 8);
  const upcoming = center.attention.filter((item) => item.sections.includes("upcoming")).slice(0, 8);
  const hero = center.attention[0];
  const empty = center.opportunities.length === 0 && !center.settings.sampleLoadedAt;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="What needs you today"
        description="Every active opportunity should show its stage, last activity, next action, due date, owner, and risk. Start with the item at the top."
      />
      <Notice message={firstParam(query.notice)} />
      {empty ? (
        <EmptyState
          title="The pipeline is empty"
          body="Import a SendPilot export or load the Realynk sample workspace. The sample includes overdue follow-ups, a stale opportunity, profiles waiting on a client, and interested leads with no opportunity."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <form action={loadSampleWorkspace}>
                <Button type="submit">Load sample workspace</Button>
              </form>
              <Button variant="outline" asChild>
                <Link href="/leads/import">Import SendPilot file</Link>
              </Button>
            </div>
          }
        />
      ) : null}
      {hero ? (
        <Link href={hero.href} className="block rounded-xl border border-primary/30 bg-accent px-5 py-4">
          <p className="text-xs font-medium tracking-[0.14em] text-primary uppercase">Do this next</p>
          <p className="mt-1 text-lg font-semibold">{hero.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{hero.detail}</p>
        </Link>
      ) : null}
      {empty ? null : <WeekCalendar today={center.today} week={firstParam(query.week)} tasks={weekTasks} notice={firstParam(query.notice)} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pipeline value" value={formatMoney(center.kpis.pipelineValue)} detail={`Closed MRR ${formatMoney(center.kpis.closedMrr)}`} />
        <KpiCard label="Active opportunities" value={String(center.kpis.activeOpportunities)} detail={`${center.kpis.nurture} in nurture`} />
        <KpiCard label="Meetings this week" value={String(center.kpis.meetingsThisWeek)} />
        <KpiCard label="Recruitment requests" value={String(center.kpis.recruitmentRequests)} />
        <KpiCard label="Profiles awaiting client" value={String(center.kpis.profilesAwaiting)} />
        <KpiCard label="Interviews" value={String(center.kpis.interviews)} />
        <KpiCard label="SOWs pending" value={String(center.kpis.sowsPending)} />
        <KpiCard label="Starts this month" value={String(center.kpis.startsThisMonth)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Needs attention" description="Overdue actions, at-risk opportunities, and interested leads with no opportunity.">
          <AttentionList items={needs} empty="Nothing overdue right now." />
        </SectionCard>
        <SectionCard title="Today's follow-ups" description="Due today in the business timezone.">
          <AttentionList items={today} empty="No follow-ups are due today." />
        </SectionCard>
      </div>
      <SectionCard title="Upcoming" description="Strategy calls, interviews, follow-ups, and dates inside the approaching window.">
        <AttentionList items={upcoming} empty="Nothing is coming up in the current window." />
      </SectionCard>
      <SectionCard title="Pipeline" description="Counts and potential revenue by stage. Revenue stays potential until Client Started or Won.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="py-2">Stage</th>
                <th className="py-2">Opportunities</th>
                <th className="py-2">Potential MRR</th>
              </tr>
            </thead>
            <tbody>
              {center.pipeline.map((row) => (
                <tr key={row.stage} className="border-t border-border">
                  <td className="py-2"><StageBadge stage={row.stage} /></td>
                  <td className="py-2 font-mono">{row.count}</td>
                  <td className="py-2 font-mono">{formatMoney(row.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard title="Stale opportunities" description={`No meaningful activity for ${center.settings.staleAfterDays} days or more. Change the threshold in Settings.`}>
        {center.stale.length === 0 ? <p className="text-sm text-muted-foreground">No stale opportunities.</p> : (
          <ul className="divide-y divide-border">
            {center.stale.map((opportunity) => (
              <li key={opportunity.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/opportunities/${opportunity.id}`} className="font-medium">{opportunity.companyName}</Link>
                  <p className="text-xs text-muted-foreground">{opportunity.stage} · last activity {formatDate(opportunity.lastActivityAt)}</p>
                </div>
                <StageBadge stage={opportunity.stage} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
