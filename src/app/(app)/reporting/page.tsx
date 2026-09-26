import Link from "next/link";
import { KpiCard, PageHeader, SectionCard } from "@/components/bits";
import { getReporting } from "@/lib/data";
import { formatPercent } from "@/lib/format";

export default async function ReportingPage() {
  const data = await getReporting();
  const noFlag = Math.max(0, data.totalLeads - data.flags.reduce((sum, row) => sum + row.count, 0));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="How the book looks"
        description="SendPilot tags, where accounts sit on the journey, and whether tasks are getting done. No revenue."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Leads" value={String(data.totalLeads)} />
        <KpiCard label="Open tasks" value={String(data.openTasks)} detail={`${data.dueToday} due today`} />
        <KpiCard label="Overdue tasks" value={String(data.overdueTasks)} />
        <KpiCard
          label="Interested on the board"
          value={String(data.journey.find((row) => row.label === "Interested")?.count ?? 0)}
          detail="Tagged Interested and not moved further"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="SendPilot" description="Current source tags. This is not the client journey.">
          <CountList rows={data.sendpilot} />
        </SectionCard>
        <SectionCard title="Client journey" description="Where accounts sit on the board.">
          <CountList rows={data.journey} />
        </SectionCard>
        <SectionCard title="Not Interested" description="How those leads have been sorted.">
          <CountList rows={data.outcomes} />
        </SectionCard>
        <SectionCard title="Flags" description="Accounts you marked on the board.">
          <CountList rows={[...data.flags, { label: "No flag", count: noFlag }]} />
        </SectionCard>
      </div>
      <SectionCard title="Conversion" description="How often accounts that entered a stage later reached the next one.">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2">Step</th>
              <th>From</th>
              <th>To</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.conversions.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.fromCount}</td>
                <td>{row.toCount}</td>
                <td>{formatPercent(row.rate)}</td>
              </tr>
            ))}
            {data.conversions.length === 0 ? (
              <tr className="border-t border-border">
                <td className="py-3 text-muted-foreground" colSpan={4}>Not enough stage history yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
      <SectionCard title="Time in stage" description="Days from first entering a stage until the next one.">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2">Span</th>
              <th>Accounts</th>
              <th>Average days</th>
              <th>Median days</th>
            </tr>
          </thead>
          <tbody>
            {data.durations.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.samples}</td>
                <td>{row.averageDays == null ? "—" : row.averageDays.toFixed(1)}</td>
                <td>{row.medianDays == null ? "—" : row.medianDays.toFixed(1)}</td>
              </tr>
            ))}
            {data.durations.length === 0 ? (
              <tr className="border-t border-border">
                <td className="py-3 text-muted-foreground" colSpan={4}>Not enough stage history yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function CountList({
  rows,
}: {
  rows: { label: string; count: number; href?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const width = Math.round((row.count / max) * 100);
        const label = row.href ? (
          <Link href={row.href} className="font-medium hover:underline">{row.label}</Link>
        ) : (
          <span className="font-medium">{row.label}</span>
        );
        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {label}
              <span className="tabular-nums">{row.count}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
