import Link from "next/link";
import { EmptyState, KpiCard, Notice, PageHeader } from "@/components/bits";
import { WeekCalendar } from "@/components/week-calendar";
import { Button } from "@/components/ui/button";
import { commandCenterPriorities } from "@/lib/attention-queue";
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
  const empty = center.opportunities.length === 0 && !center.settings.sampleLoadedAt;
  const priorities = commandCenterPriorities(center.queueCounts);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="Operations overview"
        description="Counts and this week’s calendar. Open Attention to work the queue."
        actions={
          <Button asChild>
            <Link href="/notifications">Open Attention</Link>
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
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Active leads" value={String(center.kpis.activeLeads)} />
            <KpiCard label="Open opportunities" value={String(center.kpis.activeOpportunities)} />
            <KpiCard label="Due today" value={String(center.kpis.dueToday)} />
            <KpiCard label="Overdue actions" value={String(center.kpis.overdueActions)} />
          </div>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Priority</h2>
                <p className="mt-1 text-xs text-muted-foreground">Open Attention filtered to that queue.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {priorities.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="rounded-lg border border-border px-3 py-2 hover:bg-accent/40"
                >
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-mono text-xl tabular-nums leading-none">{item.count}</p>
                </Link>
              ))}
            </div>
          </section>
          <SalesBoardCountTable rows={center.salesBoardCounts} />
          <WeekCalendar today={center.today} week={firstParam(query.week)} tasks={weekTasks} notice={firstParam(query.notice)} />
        </>
      )}
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
          <h2 className="text-sm font-semibold">Pipeline snapshot</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current counts from Interested through Trial period. Cards stay on Client journey.
          </p>
        </div>
        <Link href="/opportunities" className="text-sm font-medium text-primary hover:underline">
          Open board
        </Link>
      </div>
      <div>
        <table className="w-full table-fixed text-left">
          <thead>
            <tr>
              {rows.map((row, index) => (
                <th
                  key={row.stage}
                  title={row.label}
                  className={`border-t-4 px-1 py-2 align-bottom text-[11px] font-semibold leading-tight ${SALES_BOARD_TONES[index % SALES_BOARD_TONES.length]}`}
                >
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              {rows.map((row) => (
                <td key={row.stage} className="px-1 py-2 align-top">
                  <p className="font-mono text-lg tabular-nums leading-none">{row.count}</p>
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                    {row.unit === "lead"
                      ? row.count === 1
                        ? "lead"
                        : "leads"
                      : row.count === 1
                        ? "opp"
                        : "opps"}
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
