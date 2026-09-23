import { KpiCard, PageHeader } from "@/components/bits";
import { getAnalytics } from "@/lib/data";
import { formatMoney, formatPercent } from "@/lib/format";

export default async function AnalyticsPage() {
  const data = await getAnalytics();
  const overall = data.totalLeads === 0 ? null : data.clientsStarted / data.totalLeads;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reporting" title="Sales metrics" description="SendPilot counts and internal stage counts are labeled separately. Closed revenue is not counted while an opportunity is still in the pipeline." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total leads" value={String(data.totalLeads)} detail="Source records" />
        <KpiCard label="Interested leads" value={String(data.interested)} detail="Current SendPilot status" />
        <KpiCard label="Meetings booked" value={String(data.meetingsBooked)} detail="SendPilot" />
        <KpiCard label="Meetings completed" value={String(data.meetingsCompleted)} detail="SendPilot" />
        <KpiCard label="Strategy calls" value={String(data.strategyCalls)} detail="Ever scheduled or completed" />
        <KpiCard label="Recruitment requests" value={String(data.recruitmentRequests)} />
        <KpiCard label="Profiles sent" value={String(data.profilesSent)} detail="Send events" />
        <KpiCard label="Interviews" value={String(data.interviews)} />
        <KpiCard label="Candidates selected" value={String(data.candidatesSelected)} detail="Reached selection or later" />
        <KpiCard label="SOWs sent" value={String(data.sowsSent)} />
        <KpiCard label="SOWs signed" value={String(data.sowsSigned)} />
        <KpiCard label="Clients started" value={String(data.clientsStarted)} />
        <KpiCard label="Won" value={String(data.won)} />
        <KpiCard label="Lost" value={String(data.lost)} detail={formatMoney(data.lostValue)} />
        <KpiCard label="Nurture" value={String(data.nurtured)} />
        <KpiCard label="Lead → client" value={formatPercent(overall)} detail="Clients started / leads" />
      </div>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Conversion</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground uppercase"><tr><th className="py-2">Step</th><th>From</th><th>To</th><th>Rate</th></tr></thead>
          <tbody>
            {data.conversions.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.fromCount}</td>
                <td>{row.toCount}</td>
                <td>{formatPercent(row.rate)}</td>
              </tr>
            ))}
            <tr className="border-t border-border"><td className="py-2">Overall lead → client</td><td>{data.totalLeads}</td><td>{data.clientsStarted}</td><td>{formatPercent(overall)}</td></tr>
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Time in stage</h2>
        <p className="mt-1 text-xs text-muted-foreground">Average and median days from the first time an opportunity entered each stage. A single observation is shown, and labeled, until there is more history.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground uppercase"><tr><th className="py-2">Span</th><th>Opportunities</th><th>Average days</th><th>Median days</th></tr></thead>
          <tbody>
            {data.durations.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.samples}</td>
                <td>{row.averageDays == null ? "—" : row.averageDays.toFixed(1)}</td>
                <td>{row.medianDays == null ? "—" : row.medianDays.toFixed(1)}{row.samples === 1 ? " · 1 opportunity" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-sm text-muted-foreground">Pipeline value {formatMoney(data.pipelineValue)} · closed MRR from won opportunities {formatMoney(data.closedMrr)}. Pipeline value excludes nurture, lost, and won.</p>
    </div>
  );
}
