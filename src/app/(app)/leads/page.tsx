import Link from "next/link";
import { controlClass, Field, Notice, PageHeader, StageBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { SENDPILOT_STATUSES, OPPORTUNITY_STAGES, NURTURE_REASON_SUGGESTIONS, STAGE_PLAYBOOK } from "@/lib/domain";
import { listLeads } from "@/lib/data";
import { firstParam, formatDateTime } from "@/lib/format";
import { createLead } from "@/server/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const filters = { q: firstParam(query.q), status: firstParam(query.status), review: firstParam(query.review) };
  const leads = await listLeads(filters);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Source records"
        description="SendPilot status lives here. A sales opportunity is created only when the lead becomes commercially meaningful."
        actions={<Button asChild><Link href="/leads/import">Import file</Link></Button>}
      />
      <Notice message={firstParam(query.notice)} />
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
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
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">SendPilot</th>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3">Last sync</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/leads/${lead.id}`} className="font-medium">{lead.contactName}</Link>
                  <p className="text-xs text-muted-foreground">{lead.companyName} · {lead.email ?? "No email"}</p>
                </td>
                <td className="px-4 py-3">{lead.sendpilotStatus ?? lead.rawStatus ?? "—"}</td>
                <td className="px-4 py-3">{lead.opportunityStage ? <StageBadge stage={lead.opportunityStage} /> : <span className="text-destructive">Not found</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(lead.lastSyncedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No leads match these filters.</p> : null}
      </div>
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
          <Field label="Source"><input className={controlClass} name="source" defaultValue="Manual" /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="create_opportunity" value="yes" />
            Also create a sales opportunity
          </label>
          <Field label="Stage">
            <select className={controlClass} name="stage" defaultValue="Interested">
              {OPPORTUNITY_STAGES.filter((stage) => !["Won", "Lost", "Client Started"].includes(stage)).map((stage) => <option key={stage}>{stage}</option>)}
            </select>
          </Field>
          <Field label="Next action"><input className={controlClass} name="next_action" defaultValue={STAGE_PLAYBOOK.Interested.nextAction} /></Field>
          <Field label="Next action date"><input className={controlClass} name="next_action_date" type="date" /></Field>
          <Field label="Nurture reason">
            <input className={controlClass} name="nurture_reason" list="nurture-reasons" placeholder="Timing, budget, or your own note" />
            <datalist id="nurture-reasons">{NURTURE_REASON_SUGGESTIONS.map((reason) => <option key={reason} value={reason} />)}</datalist>
          </Field>
          <div className="md:col-span-2"><SubmitButton>Save lead</SubmitButton></div>
        </ActionForm>
      </section>
    </div>
  );
}
