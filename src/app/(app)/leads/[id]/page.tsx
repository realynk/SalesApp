import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountFlagControl, FlagBadge } from "@/components/account-flag-field";
import { controlClass, Field, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NOT_INTERESTED_OUTCOMES, SENDPILOT_STATUSES } from "@/lib/domain";
import { getLead } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { addNote, completeFollowUp, createFollowUp, updateLeadStatus } from "@/server/actions";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const openOpportunity = lead.opportunities.find((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold");
  const openTasks = lead.followUps.filter((item) => item.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/leads", label: "Back to leads" }}
        eyebrow={lead.company.name}
        title={lead.contact.name}
        description={`${lead.contact.email ?? "No email"} · SendPilot ${lead.sendpilotStatus ?? lead.rawStatus ?? "unknown"}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <FlagBadge flag={lead.accountFlag} />
            {openOpportunity ? (
              <Link className="text-sm text-primary underline" href={`/opportunities/${openOpportunity.id}`}>Open on the journey</Link>
            ) : (
              <Link className="text-sm text-primary underline" href="/opportunities">See on the board</Link>
            )}
          </div>
        }
      />
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
