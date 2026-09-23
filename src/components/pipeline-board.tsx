import Link from "next/link";
import { RISK_LEVELS, WAITING_ON, type OpportunityStage } from "@/lib/domain";
import { formatDate, formatMoney } from "@/lib/format";
import { moveStageFromBoard } from "@/server/actions";
import type { OpportunitySummary } from "@/lib/data";

const COLUMN_TONE = [
  "border-t-[#f97066]",
  "border-t-[#7a5af8]",
  "border-t-[#12b76a]",
  "border-t-[#3538cd]",
  "border-t-[#ef6820]",
  "border-t-[#155eef]",
];

export function PipelineBoard({
  stages,
  opportunities,
}: {
  stages: readonly OpportunityStage[];
  opportunities: OpportunitySummary[];
}) {
  const columns = stages
    .map((stage, index) => ({
      stage,
      tone: COLUMN_TONE[index % COLUMN_TONE.length],
      items: opportunities.filter((item) => item.stage === stage),
    }))
    .filter((column) => column.items.length > 0 || stages.length <= 6);

  if (opportunities.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">No opportunities match these filters.</p>;
  }

  const movableStages = stages.filter((stage) => stage !== "Lost" && stage !== "Client Started");

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-start gap-3">
        {columns.map((column) => {
          const value = column.items.reduce((sum, item) => sum + (item.mrr ?? 0), 0);
          return (
            <section key={column.stage} className={`w-72 shrink-0 rounded-xl border border-border border-t-4 bg-muted/40 ${column.tone}`}>
              <header className="px-3 py-3">
                <h2 className="text-sm font-bold leading-5">{column.stage}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {column.items.length} {column.items.length === 1 ? "opportunity" : "opportunities"}
                  {value ? ` · ${formatMoney(value)}` : ""}
                </p>
              </header>
              <ul className="flex flex-col gap-2 px-2 pb-3">
                {column.items.map((opportunity) => (
                  <li key={opportunity.id}>
                    <article className="rounded-lg border border-border bg-card p-3 shadow-sm">
                      <Link href={`/opportunities/${opportunity.id}`} className="block">
                        <p className="text-sm font-semibold">{opportunity.companyName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{opportunity.contactName}</p>
                        <dl className="mt-2 space-y-1 text-xs">
                          <CardField label="Next action" value={opportunity.nextAction ?? "Set the next action"} />
                          <CardField label="Due" value={formatDate(opportunity.nextActionDate)} />
                          <CardField label="Owner" value={opportunity.ownerName ?? "Unassigned"} />
                          <CardField label="Potential MRR" value={formatMoney(opportunity.mrr)} />
                        </dl>
                      </Link>
                      <form action={moveStageFromBoard} className="mt-2">
                        <input type="hidden" name="opportunity_id" value={opportunity.id} />
                        <input type="hidden" name="next_action" value={opportunity.nextAction ?? "Review this opportunity"} />
                        <input type="hidden" name="next_action_date" value={opportunity.nextActionDate ?? new Date().toISOString().slice(0, 10)} />
                        <input type="hidden" name="waiting_on" value={(WAITING_ON as readonly string[]).includes(opportunity.waitingOn) ? opportunity.waitingOn : "internal"} />
                        <input type="hidden" name="risk_level" value={(RISK_LEVELS as readonly string[]).includes(opportunity.riskLevel) ? opportunity.riskLevel : "low"} />
                        <select name="stage" defaultValue={opportunity.stage} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs" aria-label={`Move ${opportunity.companyName}`}>
                          {movableStages.map((stage) => <option key={stage}>{stage}</option>)}
                        </select>
                        <button type="submit" className="mt-1 text-xs text-primary underline">Move</button>
                      </form>
                    </article>
                  </li>
                ))}
                {column.items.length === 0 ? <li className="px-2 pb-3 text-xs text-muted-foreground">No opportunities in this stage.</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
