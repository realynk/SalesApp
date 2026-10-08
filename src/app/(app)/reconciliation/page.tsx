import Link from "next/link";
import { Notice, PageHeader } from "@/components/bits";
import { ReviewBulkList } from "@/components/review-bulk-list";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { getReconciliation } from "@/lib/data";
import { firstParam } from "@/lib/format";
import { archiveLeadFromList } from "@/server/actions";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [data, session] = await Promise.all([getReconciliation(), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
  const latest = data.syncs[0];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Lead review"
        description={
          canWrite
            ? "Matched and new import rows are added to current leads. Duplicates stay here so you can use the existing lead (keep, replace, or clear tagging), create a new lead or opportunity, or skip the row."
            : "Matched and new import rows are listed here. View-only accounts can review held rows but cannot create, skip, or change leads."
        }
        actions={canWrite ? <Button asChild><Link href="/leads/import">Import leads</Link></Button> : undefined}
      />
      <Notice message={firstParam(query.notice)} />
      {latest ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total records", latest.total_records],
            ["Matched", latest.matched_records],
            ["New", latest.new_records],
            ["Updated", latest.updated_records],
            ["Possible duplicates", latest.possible_duplicates],
            ["Unmatched", latest.unmatched_records],
            ["Needs review", latest.review_records],
            ["Errors", latest.error_count],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase">{String(label)}</p>
              <p className="mt-1 font-mono text-2xl">{String(value ?? 0)}</p>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">No SendPilot file has been imported yet.</p>}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Interested in SendPilot, no sales opportunity</h2>
        <ul className="mt-3 divide-y divide-border">
          {data.missingOpportunities.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{lead.contactName} — {lead.companyName}</p>
                <p className="text-muted-foreground">SendPilot status: {lead.sendpilotStatus}. Sales opportunity: not found.</p>
              </div>
              {canWrite ? (
              <div className="flex flex-wrap items-center gap-2">
                <form action={archiveLeadFromList}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <input type="hidden" name="next" value="/reconciliation" />
                  <SubmitButton variant="outline">Remove</SubmitButton>
                </form>
                <Button asChild><Link href={`/leads/${lead.id}`}>Create opportunity</Link></Button>
              </div>
              ) : (
                <Button variant="outline" asChild><Link href={`/leads/${lead.id}`}>View lead</Link></Button>
              )}
            </li>
          ))}
          {data.missingOpportunities.length === 0 ? <li className="py-4 text-sm text-muted-foreground">Every interested SendPilot lead has an opportunity.</li> : null}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Rows held for review</h2>
        <p className="mt-1 text-xs text-muted-foreground">Source is on each row. Select several to create, keep, or skip together.</p>
        <ReviewBulkList records={data.records} />
      </section>
    </div>
  );
}
