import Link from "next/link";
import { controlClass, PageHeader, RiskBadge, StageBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { OPPORTUNITY_STAGES, RISK_LEVELS, WAITING_ON } from "@/lib/domain";
import { getOwners, listOpportunities } from "@/lib/data";
import { firstParam, formatDate, formatMoney } from "@/lib/format";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const filters = {
    q: firstParam(query.q),
    stage: firstParam(query.stage),
    risk: firstParam(query.risk),
    owner: firstParam(query.owner),
    waiting: firstParam(query.waiting),
  };
  const [opportunities, owners] = await Promise.all([listOpportunities(filters), getOwners()]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pipeline" title="Opportunities" description="Stage, last activity, next action, due date, owner, and risk stay visible in the list." />
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3 xl:grid-cols-6">
        <input className={controlClass} name="q" defaultValue={filters.q} placeholder="Company, contact, email" />
        <select className={controlClass} name="stage" defaultValue={filters.stage ?? ""}>
          <option value="">All stages</option>
          {OPPORTUNITY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
        </select>
        <select className={controlClass} name="risk" defaultValue={filters.risk ?? ""}>
          <option value="">All risk</option>
          {RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
        </select>
        <select className={controlClass} name="owner" defaultValue={filters.owner ?? ""}>
          <option value="">All owners</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
        </select>
        <select className={controlClass} name="waiting" defaultValue={filters.waiting ?? ""}>
          <option value="">Anyone</option>
          {WAITING_ON.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3">Next action</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">MRR</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opportunity) => (
              <tr key={opportunity.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/opportunities/${opportunity.id}`} className="font-medium">{opportunity.companyName}</Link>
                  <p className="text-xs text-muted-foreground">{opportunity.contactName}</p>
                </td>
                <td className="px-4 py-3"><StageBadge stage={opportunity.stage} /></td>
                <td className="px-4 py-3">{opportunity.lastActivitySummary ?? "—"}<p className="text-xs text-muted-foreground">{formatDate(opportunity.lastActivityAt)}</p></td>
                <td className="px-4 py-3">{opportunity.nextAction ?? "Missing"}</td>
                <td className="px-4 py-3">{formatDate(opportunity.nextActionDate)}</td>
                <td className="px-4 py-3">{opportunity.ownerName ?? "Unassigned"}</td>
                <td className="px-4 py-3"><RiskBadge risk={opportunity.riskLevel} /></td>
                <td className="px-4 py-3 font-mono">{formatMoney(opportunity.mrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {opportunities.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No opportunities match these filters.</p> : null}
      </div>
    </div>
  );
}
