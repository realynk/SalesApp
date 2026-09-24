import Link from "next/link";
import { controlClass, Notice, PageHeader, RiskBadge, StageBadge } from "@/components/bits";
import { NotInterestedBoard } from "@/components/not-interested-board";
import { PipelineBoard } from "@/components/pipeline-board";
import { Button } from "@/components/ui/button";
import { BOARD_STAGES, OPPORTUNITY_STAGES, RISK_LEVELS, WAITING_ON, isHiddenBoardStage, stageLabel } from "@/lib/domain";
import { getOwners, listLeads, listOpportunities } from "@/lib/data";
import { firstParam, formatDate, formatMoney } from "@/lib/format";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const view = firstParam(query.view) === "list" ? "list" : "board";
  const interest = firstParam(query.interest) === "not-interested" ? "not-interested" : "interested";
  const filters = {
    q: firstParam(query.q),
    stage: firstParam(query.stage),
    risk: firstParam(query.risk),
    owner: firstParam(query.owner),
    waiting: firstParam(query.waiting),
  };
  const [opportunities, interestedLeads, notInterestedLeads, owners] = await Promise.all([
    interest === "interested" ? listOpportunities(filters) : Promise.resolve([]),
    interest === "interested" ? listLeads({ q: filters.q, status: "Interested" }) : Promise.resolve([]),
    listLeads({ q: filters.q, status: "Not Interested" }),
    getOwners(),
  ]);

  const href = (next: { view?: "board" | "list"; interest?: "interested" | "not-interested" }) => {
    const params = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextInterest = next.interest ?? interest;
    if (nextView === "list") params.set("view", "list");
    if (nextInterest === "not-interested") params.set("interest", "not-interested");
    if (filters.q) params.set("q", filters.q);
    if (nextInterest === "interested") {
      if (filters.stage) params.set("stage", filters.stage);
      if (filters.risk) params.set("risk", filters.risk);
      if (filters.owner) params.set("owner", filters.owner);
      if (filters.waiting) params.set("waiting", filters.waiting);
    }
    const queryString = params.toString();
    return queryString ? `/opportunities?${queryString}` : "/opportunities";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client journey"
        title={interest === "interested" ? "Interested" : "Not Interested"}
        description={
          interest === "interested"
            ? "The Interested column is every lead tagged Interested in SendPilot. Later columns are the client journey after that."
            : "The Not Interested column is every lead tagged Not Interested in SendPilot. Drag a card onto Nurture or another reason to sort it."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={interest === "interested" ? "default" : "outline"} size="sm" asChild>
              <Link href={href({ interest: "interested" })}>Interested</Link>
            </Button>
            <Button variant={interest === "not-interested" ? "default" : "outline"} size="sm" asChild>
              <Link href={href({ interest: "not-interested" })}>Not Interested</Link>
            </Button>
            <Button variant={view === "board" ? "default" : "outline"} size="sm" asChild>
              <Link href={href({ view: "board" })}>Board</Link>
            </Button>
            <Button variant={view === "list" ? "default" : "outline"} size="sm" asChild>
              <Link href={href({ view: "list" })}>List</Link>
            </Button>
          </div>
        }
      />
      <Notice message={firstParam(query.notice)} />
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3 xl:grid-cols-6">
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
        {interest === "not-interested" ? <input type="hidden" name="interest" value="not-interested" /> : null}
        <input className={controlClass} name="q" defaultValue={filters.q} placeholder="Company, contact, email" />
        {interest === "interested" ? (
          <>
            <select className={controlClass} name="stage" defaultValue={filters.stage ?? ""}>
              <option value="">All stages</option>
              {OPPORTUNITY_STAGES.filter((stage) => !isHiddenBoardStage(stage)).map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
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
          </>
        ) : null}
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {interest === "not-interested" ? (
        view === "board" ? (
          <NotInterestedBoard
            key={notInterestedLeads.map((lead) => `${lead.id}:${lead.notInterestedOutcome}`).join("|")}
            leads={notInterestedLeads}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {notInterestedLeads.map((lead) => (
                  <tr key={lead.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="font-medium">{lead.contactName}</Link>
                      <p className="text-xs text-muted-foreground">{lead.companyName}</p>
                    </td>
                    <td className="px-4 py-3">{lead.notInterestedOutcome ?? "Not Interested"}</td>
                    <td className="px-4 py-3">
                      {lead.nextFollowUp ? (
                        <>
                          <p>{lead.nextFollowUp.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(lead.nextFollowUp.dueOn)}</p>
                        </>
                      ) : <span className="text-muted-foreground">None</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {notInterestedLeads.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No Not Interested leads match these filters.</p> : null}
          </div>
        )
      ) : view === "board" ? (
        <PipelineBoard
          key={[...interestedLeads.map((lead) => lead.id), ...opportunities.map((item) => `${item.id}:${item.stage}`)].join("|")}
          stages={BOARD_STAGES}
          opportunities={opportunities}
          interestedLeads={interestedLeads}
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
