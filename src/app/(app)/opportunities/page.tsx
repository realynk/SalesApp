import Link from "next/link";
import { controlClass, Notice, PageHeader, StageBadge } from "@/components/bits";
import { NotInterestedBoard } from "@/components/not-interested-board";
import { PipelineBoard } from "@/components/pipeline-board";
import { Button } from "@/components/ui/button";
import { BOARD_STAGES } from "@/lib/domain";
import { listLeads, listOpportunities } from "@/lib/data";
import { firstParam, formatDate } from "@/lib/format";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const view = firstParam(query.view) === "list" ? "list" : "board";
  const interest = firstParam(query.interest) === "not-interested" ? "not-interested" : "interested";
  const q = firstParam(query.q);
  const [opportunities, interestedLeads, notInterestedLeads] = await Promise.all([
    interest === "interested" ? listOpportunities({ q }) : Promise.resolve([]),
    interest === "interested" ? listLeads({ q, status: "Interested" }) : Promise.resolve([]),
    listLeads({ q, status: "Not Interested" }),
  ]);

  const href = (next: { view?: "board" | "list"; interest?: "interested" | "not-interested" }) => {
    const params = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextInterest = next.interest ?? interest;
    if (nextView === "list") params.set("view", "list");
    if (nextInterest === "not-interested") params.set("interest", "not-interested");
    if (q) params.set("q", q);
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
            ? "See where each SendPilot Interested lead sits. Drag a card to move it. Drop prompts only ask what you need to set the next tasks."
            : "SendPilot Not Interested leads start here. Drag a card onto Nurture or another reason."
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
      <form className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
        {interest === "not-interested" ? <input type="hidden" name="interest" value="not-interested" /> : null}
        <input className={`${controlClass} max-w-sm`} name="q" defaultValue={q} placeholder="Company, contact, email" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {interest === "not-interested" ? (
        view === "board" ? (
          <NotInterestedBoard
            key={notInterestedLeads.map((lead) => `${lead.id}:${lead.notInterestedOutcome}:${lead.accountFlag}`).join("|")}
            leads={notInterestedLeads}
          />
        ) : (
          <SimpleTable
            empty="No Not Interested leads match."
            rows={notInterestedLeads.map((lead) => ({
              id: lead.id,
              href: `/leads/${lead.id}`,
              name: lead.contactName,
              company: lead.companyName,
              flag: lead.accountFlag,
              stage: lead.notInterestedOutcome ?? "Not Interested",
              next: lead.nextFollowUp?.title ?? "None",
              due: formatDate(lead.nextFollowUp?.dueOn),
            }))}
          />
        )
      ) : view === "board" ? (
        <PipelineBoard
          key={[...interestedLeads.map((lead) => `${lead.id}:${lead.accountFlag}`), ...opportunities.map((item) => `${item.id}:${item.stage}:${item.accountFlag}`)].join("|")}
          stages={BOARD_STAGES}
          opportunities={opportunities}
          interestedLeads={interestedLeads}
        />
      ) : (
        <SimpleTable
          empty="No opportunities match."
          rows={opportunities.map((opportunity) => ({
            id: opportunity.id,
            href: `/opportunities/${opportunity.id}`,
            name: opportunity.companyName,
            company: opportunity.contactName,
            flag: opportunity.accountFlag,
            stage: opportunity.stage,
            next: opportunity.nextAction ?? "Missing",
            due: formatDate(opportunity.nextActionDate),
            badge: true,
          }))}
        />
      )}
    </div>
  );
}

function SimpleTable({
  rows,
  empty,
}: {
  empty: string;
  rows: { id: string; href: string; name: string; company: string; flag: string | null; stage: string; next: string; due: string; badge?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Flag</th>
            <th className="px-4 py-3">Where</th>
            <th className="px-4 py-3">Next task</th>
            <th className="px-4 py-3">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3">
                <Link href={row.href} className="font-medium">{row.name}</Link>
                <p className="text-xs text-muted-foreground">{row.company}</p>
              </td>
              <td className="px-4 py-3">{row.flag ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3">{row.badge ? <StageBadge stage={row.stage} /> : row.stage}</td>
              <td className="px-4 py-3">{row.next}</td>
              <td className="px-4 py-3">{row.due}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">{empty}</p> : null}
    </div>
  );
}
