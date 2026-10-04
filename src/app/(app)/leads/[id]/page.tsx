import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountFlagControl, FlagBadge } from "@/components/account-flag-field";
import { LeadActionsMenu } from "@/components/lead-actions-menu";
import { controlClass, Field, Notice, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { NOT_INTERESTED_OUTCOMES, SENDPILOT_STATUSES, storedLinkedInHref } from "@/lib/domain";
import { SENDPILOT_UNIBOX_LINK } from "@/lib/sendpilot/app-links";
import { getLead } from "@/lib/data";
import { firstParam, formatDate } from "@/lib/format";
import { addNote, completeFollowUp, createFollowUp, updateLeadStatus } from "@/server/actions";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const lead = await getLead(id);
  if (!lead) notFound();
  const openOpportunity = lead.opportunities.find((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold");
  const openTasks = lead.followUps.filter((item) => item.status === "open");
  const archived = Boolean(lead.archivedAt);
  const linkedInHref = storedLinkedInHref(lead.contact.linkedinUrl);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: archived ? "/leads?archived=1" : "/leads", label: archived ? "Back to archived leads" : "Back to leads" }}
        eyebrow={lead.company.name}
        title={lead.contact.name}
        description={`${lead.contact.email ?? "No email"} · SendPilot ${lead.sendpilotStatus ?? lead.rawStatus ?? "unknown"}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" asChild>
              <a href={SENDPILOT_UNIBOX_LINK.href} target={SENDPILOT_UNIBOX_LINK.target} rel={SENDPILOT_UNIBOX_LINK.rel}>Open SendPilot</a>
            </Button>
            {linkedInHref ? (
              <Button variant="outline" asChild>
                <a href={linkedInHref} target="_blank" rel="noopener noreferrer">View LinkedIn</a>
              </Button>
            ) : null}
            <LeadActionsMenu leadId={lead.id} name={lead.contact.name} archived={archived} />
            <FlagBadge flag={lead.accountFlag} />
            {openOpportunity ? (
              <Link className="text-sm text-primary underline" href={`/opportunities/${openOpportunity.id}`}>Open on the journey</Link>
            ) : (
              <Link className="text-sm text-primary underline" href="/opportunities">See on the board</Link>
            )}
          </div>
        }
      />
      <Notice message={firstParam(query.notice)} />
      {archived ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          This lead is archived. SendPilot can still update the source tag. It stays off the board until you restore it.
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="SendPilot status" description="This tracks the source tag alongside SendPilot. It is not a live write back.">
          {openOpportunity ? (
            <p className="mb-3 text-sm">On the journey: <StageBadge stage={openOpportunity.stage} /> · {openOpportunity.nextAction ?? "No next action"} · {formatDate(openOpportunity.nextActionDate)}</p>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">Not on a later stage yet. Drag the card on Client journey when you are ready.</p>
          )}
          <ActionForm action={updateLeadStatus} className="grid gap-3">
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Status">
              <select className={controlClass} name="sendpilot_status" defaultValue={lead.sendpilotStatus ?? ""}>
                <option value="">Unknown</option>
                {SENDPILOT_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="If not interested">
              <select className={controlClass} name="not_interested_outcome" defaultValue={lead.notInterestedOutcome ?? ""}>
                <option value="">Not yet sorted</option>
                {NOT_INTERESTED_OUTCOMES.map((outcome) => <option key={outcome}>{outcome}</option>)}
              </select>
            </Field>
            <Field label="Flag">
              <AccountFlagControl leadId={lead.id} opportunityId={openOpportunity?.id} value={lead.accountFlag} />
            </Field>
            <SubmitButton>Save status</SubmitButton>
          </ActionForm>
        </SectionCard>
        <SectionCard title="Tasks" description="Reminders for this lead. They appear on the week calendar.">
          <ActionForm action={createFollowUp} className="grid gap-3">
            <input type="hidden" name="lead_id" value={lead.id} />
            {openOpportunity ? <input type="hidden" name="opportunity_id" value={openOpportunity.id} /> : null}
            <Field label="Task"><input className={controlClass} name="title" required placeholder="Call back, send the profile" /></Field>
            <Field label="Due"><input className={controlClass} name="due_on" type="date" required /></Field>
            <SubmitButton>Add task</SubmitButton>
          </ActionForm>
          <ul className="mt-4 divide-y divide-border text-sm">
            {openTasks.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">Due {formatDate(item.dueOn)}</p>
                </div>
                <form action={completeFollowUp}>
                  <input type="hidden" name="follow_up_id" value={item.id} />
                  <input type="hidden" name="lead_id" value={lead.id} />
                  {openOpportunity ? <input type="hidden" name="opportunity_id" value={openOpportunity.id} /> : null}
                  <SubmitButton variant="outline">Done</SubmitButton>
                </form>
              </li>
            ))}
            {openTasks.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No open tasks.</li> : null}
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="Notes">
        <ActionForm action={addNote} className="space-y-3">
          <input type="hidden" name="lead_id" value={lead.id} />
          <textarea className={textareaClass} name="body" required placeholder="Anything you need to remember" />
          <SubmitButton>Add note</SubmitButton>
        </ActionForm>
        <ul className="mt-4 space-y-3 text-sm">
          {lead.notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border px-3 py-2">
              <p>{note.body}</p>
            </li>
          ))}
          {lead.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
        </ul>
      </SectionCard>
    </div>
  );
}
