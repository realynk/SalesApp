import Link from "next/link";
import { AttentionList, EmptyState, KpiCard, Notice, PageHeader, SectionCard } from "@/components/bits";
import { WeekCalendar } from "@/components/week-calendar";
import { Button } from "@/components/ui/button";
import { buildWeekTasks, type SalesBoardColumnCount } from "@/lib/domain";
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
      {empty ? null : <SalesBoardCountTable rows={center.salesBoardCounts} />}
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

const SALES_BOARD_TONES = [
  "border-t-[#f97066]",
  "border-t-[#7a5af8]",
  "border-t-[#12b76a]",
  "border-t-[#3538cd]",
  "border-t-[#ef6820]",
  "border-t-[#155eef]",
];

function SalesBoardCountTable({ rows }: { rows: SalesBoardColumnCount[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Client journey now</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current counts from Interested through Trial period. Won, Lost, Nurture, and Client Started are omitted. Cards stay on Client journey.
          </p>
        </div>
        <Link href="/opportunities" className="text-sm font-medium text-primary hover:underline">
          Open board
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-left text-sm">
          <thead>
            <tr>
              {rows.map((row, index) => (
                <th
                  key={row.stage}
                  className={`min-w-[9.5rem] max-w-[11rem] border-t-4 px-3 py-3 text-sm font-bold leading-5 ${SALES_BOARD_TONES[index % SALES_BOARD_TONES.length]}`}
                >
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              {rows.map((row) => (
                <td key={row.stage} className="px-3 py-3 align-top">
                  <p className="font-mono text-2xl tabular-nums">{row.count}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.unit === "lead"
                      ? row.count === 1
                        ? "lead"
                        : "leads"
                      : row.count === 1
                        ? "opportunity"
                        : "opportunities"}
                  </p>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
