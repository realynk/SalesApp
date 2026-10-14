import Link from "next/link";
import { KpiCard, PageHeader, SectionCard } from "@/components/bits";
import { ReportingDurationPicker } from "@/components/reporting-duration-picker";
import { BOARD_STAGES, NOT_INTERESTED_INTAKE, NOT_INTERESTED_OUTCOMES, SENDPILOT_STATUSES, stageLabel } from "@/lib/domain";
import { formatDate, formatPercent } from "@/lib/format";
import { getReportingDashboard } from "@/lib/reporting-load";
import { reportingHref, type ReportingTab } from "@/lib/reporting-duration";
import type { BuiltReporting, Coverage } from "@/lib/reporting-metrics";

const TABS: { id: ReportingTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "comparison", label: "SendPilot comparison" },
  { id: "conversions", label: "Conversions" },
  { id: "follow-up", label: "Follow-up health" },
];

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { tab, today, dashboard, journeyConversions, journeyDurations } = await getReportingDashboard(query);
  const { window, timeZone, overview, currentlyTagged, comparison, accounts, salesFunnel, followUp, trends, trendAllTimeClipped } = dashboard;
  const hrefFor = (nextTab: ReportingTab) =>
    reportingHref({ tab: nextTab, range: window.key, customFrom: window.customFrom, customTo: window.customTo });
  const periodLabel = window.startOn ? `${formatDate(window.startOn)} – ${formatDate(window.endOn)}` : `Through ${formatDate(window.endOn)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="Sales performance & growth"
        description="Event-based sales KPIs plus the current book. Duration applies to tag changes, sales profiles, strategy calls, and conversions. Currently tagged figures are the live unarchived book."
        actions={<ReportingDurationPicker value={window.key} tab={tab} customFrom={window.customFrom} customTo={window.customTo} today={today} />}
      />

      <p className="text-sm text-muted-foreground">
        Timezone <span className="font-medium text-foreground">{timeZone}</span>
        <span aria-hidden> · </span>
        {periodLabel}
        <span aria-hidden> · </span>
        Historical events include archived leads. Current-state KPIs exclude them.
      </p>

      <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" aria-label="Reporting sections">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={hrefFor(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <Overview
          currentlyTagged={currentlyTagged}
          overview={overview}
          trends={trends}
          trendAllTimeClipped={trendAllTimeClipped}
        />
      ) : null}
      {tab === "comparison" ? <Comparison comparison={comparison} accounts={accounts} /> : null}
      {tab === "conversions" ? (
        <Conversions salesFunnel={salesFunnel} overview={overview} journeyConversions={journeyConversions} journeyDurations={journeyDurations} />
      ) : null}
      {tab === "follow-up" ? <FollowUp followUp={followUp} /> : null}

      <SectionCard
        collapsible
        title="How these numbers are counted"
        description="Definitions stay the same across tabs."
      >
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>New Interested / Not Interested use the first recorded tag-transition activity in {timeZone}. Later retags are not counted again.</li>
          <li>Leads with a current Interested or Not Interested tag but no transition activity are Untrackable. Import dates are not used as tag dates.</li>
          <li>Sales profiles sent are activities titled “Profile sent to the client”. Recruitment profile batches are excluded.</li>
          <li>Current Interested with no profile recorded is unarchived Interested leads without that sales activity. It does not prove nothing was sent outside SalesApp.</li>
          <li>Meetings booked are strategy_calls in Scheduled or Complete with a call date in range. Completed are Complete with a call date. Draft, Cancelled, and missing dates are not counted as booked.</li>
          <li>SendPilot comparison uses integration IDs. Realynk Main is the legacy_env account. Combined unique deduplicates by lead. Both accounts and Unassigned are listed separately.</li>
          <li>SendPilot Meeting Booked tags are shown only under Currently tagged. They are not used for meeting KPIs.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

function Overview({
  currentlyTagged,
  overview,
  trends,
  trendAllTimeClipped,
}: {
  currentlyTagged: BuiltReporting["currentlyTagged"];
  overview: BuiltReporting["overview"];
  trends: BuiltReporting["trends"];
  trendAllTimeClipped: boolean;
}) {
  const sendpilot = SENDPILOT_STATUSES.map((status) => ({
    label: status,
    count: currentlyTagged.sendpilot.find((row) => row.label === status)?.count ?? 0,
    href:
      status === "Interested"
        ? "/opportunities"
        : status === "Not Interested"
          ? "/opportunities?interest=not-interested"
          : `/leads?status=${encodeURIComponent(status)}`,
  }));
  const journey = BOARD_STAGES.map((stage) => ({
    label: stageLabel(stage),
    count: currentlyTagged.journey.find((row) => row.label === stage)?.count ?? 0,
    href: "/opportunities",
  }));
  const outcomes = [NOT_INTERESTED_INTAKE, ...NOT_INTERESTED_OUTCOMES].map((column) => ({
    label: column,
    count: currentlyTagged.outcomes.find((row) => row.label === column)?.count ?? 0,
    href: "/opportunities?interest=not-interested",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Currently tagged</h2>
        <p className="mt-1 text-xs text-muted-foreground">Live unarchived snapshot. Not limited to the selected duration.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Leads in the book" value={String(currentlyTagged.totalLeads)} href="/leads" />
          <KpiCard label="Currently tagged Interested" value={String(currentlyTagged.interested)} href="/opportunities" />
          <KpiCard label="Currently tagged Not Interested" value={String(currentlyTagged.notInterested)} href="/opportunities?interest=not-interested" />
          <KpiCard
            label="Currently tagged Meeting Booked"
            value={String(currentlyTagged.meetingBookedTag)}
            detail="SendPilot tag only. Not the strategy-call KPI."
            href="/leads?status=Meeting%20Booked"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold">Selected period</h2>
        <p className="mt-1 text-xs text-muted-foreground">First tag transitions, sales profile events, and strategy_calls. Archived leads are included in event counts.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="New Interested"
            value={eventValue(overview.newInterested, overview.interestedUntrackable)}
            detail={untrackableDetail(overview.interestedUntrackable, "Interested")}
          />
          <KpiCard
            label="New Not Interested"
            value={eventValue(overview.newNotInterested, overview.notInterestedUntrackable)}
            detail={untrackableDetail(overview.notInterestedUntrackable, "Not Interested")}
          />
          <KpiCard
            label="Sales profiles sent"
            value={String(overview.salesProfilesSentLeads)}
            detail={`${overview.salesProfilesSentEvents} recorded send${overview.salesProfilesSentEvents === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="Interested, no profile recorded"
            value={String(overview.awaitingProfile)}
            detail="Current unarchived Interested without a sales profile event"
          />
          <KpiCard
            label="Meetings booked"
            value={String(overview.meetingsBooked)}
            detail={meetingDetail(overview.meetingsMissingDate, overview.meetingsWithoutLead, "Scheduled or Complete")}
          />
          <KpiCard
            label="Meetings completed"
            value={String(overview.meetingsCompleted)}
            detail={meetingDetail(overview.meetingsMissingDate, 0, "Complete")}
          />
          <RateCard label="Interested → profile sent" metric={overview.conversions.interestedToProfile} />
          <RateCard label="Interested → meeting booked" metric={overview.conversions.interestedToMeeting} />
        </div>
      </div>

      <SectionCard title="Daily trend" description={trendAllTimeClipped ? "All-time view shows the last 90 days of daily counts." : "Counts by business-calendar day."}>
        {trends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No days in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="py-2">Day</th>
                  <th>New Interested</th>
                  <th>New Not Interested</th>
                  <th>Profiles sent</th>
                  <th>Meetings booked</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((row) => (
                  <tr key={row.day} className="border-t border-border">
                    <td className="py-2">{formatDate(row.day)}</td>
                    <td className="tabular-nums">{row.newInterested}</td>
                    <td className="tabular-nums">{row.newNotInterested}</td>
                    <td className="tabular-nums">{row.profilesSent}</td>
                    <td className="tabular-nums">{row.meetingsBooked}</td>
                    <td className="tabular-nums">{row.meetingsCompleted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-2">
          <div className="grid xl:grid-cols-2">
            <div className="border-b border-border px-4 py-3 xl:border-r xl:border-b-0">
              <h2 className="text-sm font-semibold">Currently tagged · SendPilot</h2>
              <p className="mt-1 text-xs text-muted-foreground">Current source tags. This is not the client journey.</p>
              <div className="mt-3">
                <CountList rows={sendpilot} />
              </div>
            </div>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Currently tagged · Client journey</h2>
              <p className="mt-1 text-xs text-muted-foreground">Where unarchived accounts sit on the board.</p>
              <div className="mt-3">
                <CountList rows={journey} />
              </div>
            </div>
          </div>
        </section>
        <SectionCard title="Currently tagged · Not Interested" description="How those unarchived leads have been sorted.">
          <CountList rows={outcomes} />
        </SectionCard>
      </div>
    </div>
  );
}

function Comparison({
  comparison,
  accounts,
}: {
  comparison: BuiltReporting["comparison"];
  accounts: BuiltReporting["accounts"];
}) {
  const rows = [
    { label: accounts.mainName, interested: comparison.newInterested.main, notInterested: comparison.newNotInterested.main, profiles: comparison.profilesSent.main },
    { label: accounts.otherName, interested: comparison.newInterested.other, notInterested: comparison.newNotInterested.other, profiles: comparison.profilesSent.other },
    { label: "Both accounts", interested: comparison.newInterested.both, notInterested: comparison.newNotInterested.both, profiles: comparison.profilesSent.both },
    { label: "Unassigned", interested: comparison.newInterested.unassigned, notInterested: comparison.newNotInterested.unassigned, profiles: comparison.profilesSent.unassigned },
    { label: "Combined unique", interested: comparison.newInterested.combinedUnique, notInterested: comparison.newNotInterested.combinedUnique, profiles: comparison.profilesSent.combinedUnique },
  ];
  const assignedPct = comparison.coverageRate.rate == null ? "—" : formatPercent(comparison.coverageRate.rate);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active leads with a SendPilot account" value={String(comparison.assignedActive)} />
        <KpiCard label="Unassigned active leads" value={String(comparison.unassignedActive)} detail="No sendpilot_lead_identities row" />
        <KpiCard label="Leads on both accounts" value={String(comparison.bothAccounts)} />
        <KpiCard
          label="Attribution coverage"
          value={assignedPct}
          detail={comparison.coverageRate.coverage === "unavailable" ? "No active leads" : "Share of unarchived leads linked to an integration ID"}
        />
      </div>
      {accounts.otherNames.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Only the Realynk Main integration is present. Other-account columns stay empty until another integration ID exists.
        </p>
      ) : null}
      <SectionCard title="Period events by account" description={`${accounts.mainName} is the legacy_env integration. ${accounts.otherName} is labeled from the integration record, not a hardcoded name. Combined unique counts each lead once.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="py-2">Account</th>
                <th>New Interested</th>
                <th>New Not Interested</th>
                <th>Sales profiles sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const combined = row.label === "Combined unique";
                const interestedBase = comparison.newInterested.main + comparison.newInterested.other + comparison.newInterested.both + comparison.newInterested.unassigned;
                const notInterestedBase = comparison.newNotInterested.main + comparison.newNotInterested.other + comparison.newNotInterested.both + comparison.newNotInterested.unassigned;
                const profileBase = comparison.profilesSent.main + comparison.profilesSent.other + comparison.profilesSent.both + comparison.profilesSent.unassigned;
                return (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="tabular-nums">{row.interested}{combined ? "" : share(row.interested, interestedBase)}</td>
                    <td className="tabular-nums">{row.notInterested}{combined ? "" : share(row.notInterested, notInterestedBase)}</td>
                    <td className="tabular-nums">{row.profiles}{combined ? "" : share(row.profiles, profileBase)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function Conversions({
  salesFunnel,
  overview,
  journeyConversions,
  journeyDurations,
}: {
  salesFunnel: BuiltReporting["salesFunnel"];
  overview: BuiltReporting["overview"];
  journeyConversions: Awaited<ReturnType<typeof getReportingDashboard>>["journeyConversions"];
  journeyDurations: Awaited<ReturnType<typeof getReportingDashboard>>["journeyDurations"];
}) {
  const salesRows = [
    { label: "New Interested (cohort)", count: salesFunnel.interested },
    { label: "Then sales profile sent", count: salesFunnel.profileSent },
    { label: "Then strategy call booked", count: salesFunnel.meetingBooked },
    { label: "Then strategy call completed", count: salesFunnel.meetingCompleted },
  ];
  return (
    <div className="space-y-6">
      <SectionCard title="Sales funnel" description="Cohort is first Interested in the selected period. Later steps are recorded sales profile_sent events, then strategy_calls with a call date.">
        {salesFunnel.interested === 0 ? (
          <p className="text-sm text-muted-foreground">
            {overview.interestedUntrackable > 0
              ? `No trackable first-Interested events in this period. ${overview.interestedUntrackable} currently Interested lead${overview.interestedUntrackable === 1 ? "" : "s"} have no tag-transition history.`
              : "No first-Interested tag transitions in this period."}
          </p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {salesRows.map((row) => (
              <li key={row.label} className="rounded-lg border border-border px-3 py-3">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="mt-1 font-mono text-2xl tabular-nums">{row.count}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <RateCard label="Interested → profile sent" metric={overview.conversions.interestedToProfile} />
          <RateCard label="Interested → meeting booked" metric={overview.conversions.interestedToMeeting} />
          <RateCard label="Profile sent → meeting booked" metric={overview.conversions.profileToMeeting} />
          <RateCard label="Meeting booked → completed" metric={overview.conversions.meetingToComplete} />
        </div>
      </SectionCard>
      <SectionCard title="Client journey conversion" description="Existing recruitment/client funnel from pipeline stage history. This is not the sales VA-profile funnel.">
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
            {journeyConversions.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.fromCount}</td>
                <td>{row.toCount}</td>
                <td>{row.fromCount === 0 ? "—" : formatPercent(row.rate)}</td>
              </tr>
            ))}
            {journeyConversions.length === 0 ? (
              <tr className="border-t border-border">
                <td className="py-3 text-muted-foreground" colSpan={4}>Not enough stage history yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
      <SectionCard title="Time in stage" description="Days from first entering a journey stage until the next one.">
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
            {journeyDurations.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2">{row.label}</td>
                <td>{row.samples}</td>
                <td>{row.averageDays == null ? "—" : row.averageDays.toFixed(1)}</td>
                <td>{row.medianDays == null ? "—" : row.medianDays.toFixed(1)}</td>
              </tr>
            ))}
            {journeyDurations.length === 0 ? (
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

function FollowUp({ followUp }: { followUp: BuiltReporting["followUp"] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Open follow-ups and opportunity next actions for unarchived leads. This is not verified SendPilot no-response data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open follow-ups" value={String(followUp.open)} />
        <KpiCard label="Due today" value={String(followUp.dueToday)} />
        <KpiCard label="Overdue" value={String(followUp.overdue)} />
        <KpiCard label="Open next actions" value={String(followUp.openNextActions)} detail="Opportunity next-action dates still set" />
      </div>
      <SectionCard title="Overdue aging" description="Days past due for open follow-ups. Not a SendPilot No Response tag.">
        {followUp.overdue === 0 ? (
          <p className="text-sm text-muted-foreground">No overdue follow-ups on unarchived leads.</p>
        ) : (
          <CountList
            rows={[
              { label: "1–3 days", count: followUp.aging.d1to3 },
              { label: "4–7 days", count: followUp.aging.d4to7 },
              { label: "8–14 days", count: followUp.aging.d8to14 },
              { label: "15+ days", count: followUp.aging.d15plus },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );
}

function RateCard({
  label,
  metric,
}: {
  label: string;
  metric: { numerator: number; denominator: number; rate: number | null; coverage: Coverage };
}) {
  const value = metric.coverage === "unavailable" ? "—" : formatPercent(metric.rate);
  const detail =
    metric.coverage === "unavailable"
      ? "No trackable cohort in this period"
      : `${metric.numerator} of ${metric.denominator}${metric.coverage === "zero" ? " · true zero" : ""}`;
  return <KpiCard label={label} value={value} detail={detail} />;
}

function eventValue(count: number, untrackable: number) {
  if (count === 0 && untrackable > 0) return "—";
  return String(count);
}

function untrackableDetail(count: number, tag: string) {
  if (count === 0) return `First ${tag} tag-transition in this timezone`;
  return `${count} ${tag} lead${count === 1 ? "" : "s"} have no tag-transition history`;
}

function share(part: number, whole: number) {
  if (whole === 0) return "";
  return ` (${formatPercent(part / whole)})`;
}

function meetingDetail(missingDate: number, missingLead: number, status: string) {
  const bits = [`strategy_calls ${status} with a call date`];
  if (missingDate) bits.push(`${missingDate} missing call date`);
  if (missingLead) bits.push(`${missingLead} not linked to a lead`);
  return bits.join(" · ");
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
