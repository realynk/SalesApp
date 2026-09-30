import Link from "next/link";
import { controlClass, Field, Notice, PageHeader, StageBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { LeadBulkArchive } from "@/components/lead-bulk-archive";
import { SendPilotStatusControl } from "@/components/sendpilot-status-field";
import { SENDPILOT_STATUSES, NOT_INTERESTED_OUTCOMES } from "@/lib/domain";
import { countLeads, listLeads } from "@/lib/data";
import { firstParam, formatDate } from "@/lib/format";
import { createLead } from "@/server/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const archived = firstParam(query.archived) === "1";
  const filters = { q: firstParam(query.q), status: firstParam(query.status), review: firstParam(query.review), archived };
  const [leads, totalLeads] = await Promise.all([
    listLeads(filters),
    countLeads({ archived, status: filters.status || undefined }),
  ]);
  const leadCountLabel = `${totalLeads.toLocaleString("en-US")} ${archived ? "archived leads" : filters.status ? `${filters.status} leads` : "leads"}`;
  const table = (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            {archived ? null : <th className="px-4 py-3 w-10"></th>}
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Flag</th>
            <th className="px-4 py-3">SendPilot</th>
            <th className="px-4 py-3">Journey</th>
            <th className="px-4 py-3">Next task</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-t border-border">
              {archived ? null : (
                <td className="px-4 py-3">
                  <input type="checkbox" name="lead_id" value={lead.id} />
                </td>
              )}
              <td className="px-4 py-3">
                <Link href={`/leads/${lead.id}`} className="font-medium">{lead.contactName}</Link>
                <p className="text-xs text-muted-foreground">{lead.companyName} · {lead.email ?? "No email"}</p>
              </td>
              <td className="px-4 py-3">{lead.accountFlag ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3">
                <SendPilotStatusControl
                  leadId={lead.id}
                  status={lead.sendpilotStatus}
                  outcome={lead.notInterestedOutcome}
                />
              </td>
              <td className="px-4 py-3">{lead.opportunityStage ? <StageBadge stage={lead.opportunityStage} /> : <span className="text-muted-foreground">On the board</span>}</td>
              <td className="px-4 py-3">{lead.nextFollowUp ? <><p>{lead.nextFollowUp.title}</p><p className="text-xs text-muted-foreground">{formatDate(lead.nextFollowUp.dueOn)}</p></> : <span className="text-muted-foreground">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No leads match these filters.</p> : null}
      {!filters.q && !filters.review && totalLeads > leads.length ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">Showing the {leads.length.toLocaleString("en-US")} most recently updated of {leadCountLabel}.</p>
      ) : null}
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title={archived ? "Archived leads" : "Source records"}
        description={
          archived
            ? "Hidden from the board, dashboard, and active lists. Restore one to work it again."
            : "SendPilot and imported contacts. Change the SendPilot tag in this list, or open a lead to add a reminder. The board is where the journey lives."
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <p className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm">
              <span className="font-medium tabular-nums">{leadCountLabel}</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant={archived ? "outline" : "default"} size="sm" asChild>
                <Link href="/leads">Active</Link>
              </Button>
              <Button variant={archived ? "default" : "outline"} size="sm" asChild>
                <Link href="/leads?archived=1">Archived</Link>
              </Button>
              <Button asChild><Link href="/leads/import">Import file</Link></Button>
            </div>
          </div>
        }
      />
      <Notice message={firstParam(query.notice)} />
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
        {archived ? <input type="hidden" name="archived" value="1" /> : null}
        <input className={controlClass} name="q" defaultValue={filters.q} placeholder="Name, company, email, LinkedIn" />
        <select className={controlClass} name="status" defaultValue={filters.status ?? ""}>
          <option value="">All SendPilot statuses</option>
          {SENDPILOT_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        <select className={controlClass} name="review" defaultValue={filters.review ?? ""}>
          <option value="">All leads</option>
          <option value="missing">No opportunity yet</option>
          <option value="yes">Needs review</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {archived ? table : <LeadBulkArchive>{table}</LeadBulkArchive>}
      {archived ? null : (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Add a lead manually</h2>
          <ActionForm action={createLead} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="First name"><input className={controlClass} name="first_name" required /></Field>
            <Field label="Last name"><input className={controlClass} name="last_name" /></Field>
            <Field label="Company"><input className={controlClass} name="company" required /></Field>
            <Field label="Email"><input className={controlClass} name="email" type="email" /></Field>
            <Field label="LinkedIn URL"><input className={controlClass} name="linkedin_url" /></Field>
            <Field label="Phone"><input className={controlClass} name="phone" /></Field>
            <Field label="SendPilot status">
              <select className={controlClass} name="sendpilot_status" defaultValue="Interested">
                <option value="">Unknown</option>
                {SENDPILOT_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="If not interested">
              <select className={controlClass} name="not_interested_outcome" defaultValue="">
                <option value="">Not yet sorted</option>
                {NOT_INTERESTED_OUTCOMES.map((outcome) => <option key={outcome}>{outcome}</option>)}
              </select>
            </Field>
            <Field label="Source"><input className={controlClass} name="source" defaultValue="Manual" /></Field>
            <div className="md:col-span-2"><SubmitButton>Save lead</SubmitButton></div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
