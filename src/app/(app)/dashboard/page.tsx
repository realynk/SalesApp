import Link from "next/link";
import { AttentionList, EmptyState, KpiCard, Notice, PageHeader, SectionCard } from "@/components/bits";
import { WeekCalendar } from "@/components/week-calendar";
import { Button } from "@/components/ui/button";
import { buildWeekTasks } from "@/lib/domain";
import { getCommandCenter } from "@/lib/data";
import { firstParam } from "@/lib/format";
import { loadSampleWorkspace } from "@/server/actions";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string; week?: string }> }) {
  const query = await searchParams;
  const [center, session] = await Promise.all([getCommandCenter(), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
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
  const needs = center.attention.filter((item) => item.sections.includes("needs")).slice(0, 10);
  const empty = center.opportunities.length === 0 && !center.settings.sampleLoadedAt;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="What do I do next?"
        description="Reminders and this week’s tasks. Use Client journey to see where each lead sits."
        actions={
          <Button asChild>
            <Link href="/opportunities">Open client journey</Link>
          </Button>
        }
      />
      <Notice message={firstParam(query.notice)} />
      {empty ? (
        <EmptyState
          title="No leads yet"
          body="Import a SendPilot file so Interested and Not Interested leads show on the board."
          action={
            canWrite ? (
              <div className="flex flex-wrap justify-center gap-2">
                <form action={loadSampleWorkspace}>
                  <Button type="submit">Load sample workspace</Button>
                </form>
                <Button variant="outline" asChild>
                  <Link href="/leads/import">Import leads</Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : null}
      {empty ? null : <WeekCalendar today={center.today} week={firstParam(query.week)} tasks={weekTasks} notice={firstParam(query.notice)} canWrite={canWrite} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Tagged Interested" value={String(center.kpis.interestedLeads)} detail={`${center.kpis.interestedWithoutOpportunity} still on Interested`} />
        <KpiCard label="Sent profiles" value={String(center.kpis.profilesInReview)} />
        <KpiCard label="Meetings this week" value={String(center.kpis.meetingsThisWeek)} />
      </div>
      <SectionCard
        collapsible
        title="Needs attention"
        description="Overdue tasks and Interested leads that have not moved yet."
        action={needs.length > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{needs.length}</span> : undefined}
      >
        <AttentionList items={needs} empty="Nothing overdue right now." />
      </SectionCard>
    </div>
  );
}
