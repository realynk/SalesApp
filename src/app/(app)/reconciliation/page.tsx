import Link from "next/link";
import { Notice, PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getReconciliation } from "@/lib/data";
import { firstParam, formatDateTime } from "@/lib/format";
import { createFromReviewedRecord } from "@/server/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const data = await getReconciliation();
  const latest = data.syncs[0];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SendPilot"
        title="Lead reconciliation"
        description="Every meaningful SendPilot lead is accounted for. Duplicates and unmatched rows stay visible until someone reviews them."
        actions={<Button asChild><Link href="/leads/import">Import file</Link></Button>}
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
              <Button asChild><Link href={`/leads/${lead.id}`}>Create opportunity</Link></Button>
            </li>
          ))}
          {data.missingOpportunities.length === 0 ? <li className="py-4 text-sm text-muted-foreground">Every interested SendPilot lead has an opportunity.</li> : null}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Rows held for review</h2>
        <ul className="mt-3 space-y-4">
          {data.records.map((record) => (
            <li key={String(record.id)} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{String(record.full_name ?? "Unnamed")} — {String(record.company_name ?? "No company")}</p>
              <p className="text-muted-foreground">{String(record.classification)} · {String(record.review_reason ?? "Needs a person to decide")}</p>
              <p className="text-xs text-muted-foreground">{String(record.email ?? "No email")} · {formatDateTime(String(record.created_at ?? ""))}</p>
              <ActionForm action={createFromReviewedRecord} className="mt-3 space-y-2">
                <input type="hidden" name="record_id" value={String(record.id)} />
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" required /> I checked this and want a contact created anyway.</label>
                <SubmitButton variant="outline">Create contact from this row</SubmitButton>
              </ActionForm>
            </li>
          ))}
          {data.records.length === 0 ? <li className="text-sm text-muted-foreground">No unmatched or duplicate rows are waiting.</li> : null}
        </ul>
      </section>
    </div>
  );
}
