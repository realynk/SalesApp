import Link from "next/link";
import { controlClass, Notice, PageHeader, RiskBadge, StageBadge } from "@/components/bits";
import { PipelineBoard } from "@/components/pipeline-board";
import { Button } from "@/components/ui/button";
import { OPPORTUNITY_STAGES, RISK_LEVELS, WAITING_ON } from "@/lib/domain";
import { getOwners, listOpportunities } from "@/lib/data";
import { firstParam, formatDate, formatMoney } from "@/lib/format";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const view = firstParam(query.view) === "list" ? "list" : "board";
  const filters = {
    q: firstParam(query.q),
    stage: firstParam(query.stage),
    risk: firstParam(query.risk),
    owner: firstParam(query.owner),
    waiting: firstParam(query.waiting),
  };
  const [opportunities, owners] = await Promise.all([listOpportunities(filters), getOwners()]);
  const href = (nextView: "board" | "list") => {
    const params = new URLSearchParams();
    if (nextView === "list") params.set("view", "list");
    if (filters.q) params.set("q", filters.q);
    if (filters.stage) params.set("stage", filters.stage);
    if (filters.risk) params.set("risk", filters.risk);
    if (filters.owner) params.set("owner", filters.owner);
    if (filters.waiting) params.set("waiting", filters.waiting);
    const queryString = params.toString();
    return queryString ? `/opportunities?${queryString}` : "/opportunities";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Opportunities"
        description="Drag a card onto a stage to move it. Stage, last activity, next action, due date, owner, and risk stay visible. Use the list to scan every row."
        actions={
          <div className="flex gap-2">
            <Button variant={view === "board" ? "default" : "outline"} size="sm" asChild>
              <Link href={href("board")}>Board</Link>
            </Button>
            <Button variant={view === "list" ? "default" : "outline"} size="sm" asChild>
              <Link href={href("list")}>List</Link>
            </Button>
          </div>
        }
      />
      <Notice message={firstParam(query.notice)} />
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3 xl:grid-cols-6">
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
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
      {view === "board" ? (
        <PipelineBoard
          key={opportunities.map((item) => `${item.id}:${item.stage}`).join("|")}
          stages={OPPORTUNITY_STAGES}
          opportunities={opportunities}
        />
      ) : (
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
      )}
    </div>
  );
}
