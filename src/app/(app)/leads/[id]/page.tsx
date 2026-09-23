import Link from "next/link";
import { notFound } from "next/navigation";
import { controlClass, Field, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ACTIVITY_LABELS, NURTURE_REASON_SUGGESTIONS, OPPORTUNITY_STAGES, STAGE_PLAYBOOK, type ActivityType } from "@/lib/domain";
import { getLead } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { addNote, createFollowUp, createOpportunity } from "@/server/actions";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const openOpportunity = lead.opportunities.find((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lead" title={lead.contact.name} description={lead.company.name} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="External / source data" description="Came from SendPilot or the import file. This is not the sales pipeline.">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="SendPilot status" value={lead.sendpilotStatus ?? lead.rawStatus ?? "Unknown"} />
            <Info label="Source" value={lead.source} />
            <Info label="Email" value={lead.contact.email ?? "—"} />
            <Info label="Phone" value={lead.contact.phone ?? "—"} />
            <Info label="LinkedIn" value={lead.contact.linkedinUrl ?? "—"} />
            <Info label="Title" value={lead.contact.title ?? "—"} />
            <Info label="Last SendPilot sync" value={formatDateTime(lead.lastSyncedAt)} />
            <Info label="Review" value={lead.requiresReview ? lead.reviewReason ?? "Needs review" : "Clear"} />
          </dl>
        </SectionCard>
        <SectionCard title="Internal sales tracking" description="Created in this application after the lead became meaningful.">
          {openOpportunity ? (
            <div className="space-y-2 text-sm">
              <StageBadge stage={openOpportunity.stage} />
              <p>{openOpportunity.nextAction ?? "No next action"} · {formatDate(openOpportunity.nextActionDate)}</p>
              <Link className="text-primary underline" href={`/opportunities/${openOpportunity.id}`}>Open opportunity</Link>
            </div>
          ) : (
            <p className="text-sm text-destructive">Sales opportunity: not found</p>
          )}
          {lead.sendpilotStatus === "Interested" && !openOpportunity ? (
            <p className="mt-3 text-sm">SendPilot says Interested. Create the opportunity so this lead cannot disappear.</p>
          ) : null}
        </SectionCard>
      </div>
      {!openOpportunity ? (
        <SectionCard title="Create opportunity" description="Not Interested can still become a nurture follow-up. The reason list is a suggestion, not a limit.">
          <ActionForm action={createOpportunity} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Stage">
              <select className={controlClass} name="stage" defaultValue={lead.sendpilotStatus === "Not Interested" ? "On Hold / Nurture" : "Interested"}>
                {OPPORTUNITY_STAGES.filter((stage) => !["Won", "Lost", "Client Started"].includes(stage)).map((stage) => <option key={stage}>{stage}</option>)}
              </select>
            </Field>
            <Field label="Next action"><input className={controlClass} name="next_action" defaultValue={STAGE_PLAYBOOK.Interested.nextAction} required /></Field>
            <Field label="Next action date"><input className={controlClass} name="next_action_date" type="date" required /></Field>
            <Field label="Nurture reason"><input className={controlClass} name="nurture_reason" list="reasons" /></Field>
            <datalist id="reasons">{NURTURE_REASON_SUGGESTIONS.map((reason) => <option key={reason} value={reason} />)}</datalist>
            <Field label="Notes"><textarea className={textareaClass} name="nurture_notes" /></Field>
            <div className="md:col-span-2"><SubmitButton>Create opportunity</SubmitButton></div>
          </ActionForm>
        </SectionCard>
      ) : null}
      <SectionCard title="Follow-up">
        <ActionForm action={createFollowUp} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="lead_id" value={lead.id} />
          {openOpportunity ? <input type="hidden" name="opportunity_id" value={openOpportunity.id} /> : null}
          <Field label="What happens next"><input className={controlClass} name="title" required /></Field>
          <Field label="Due date"><input className={controlClass} name="due_on" type="date" required /></Field>
          <Field label="Reason"><input className={controlClass} name="reason" list="reasons" /></Field>
          <Field label="Notes"><textarea className={textareaClass} name="notes" /></Field>
          <div className="md:col-span-2"><SubmitButton>Schedule follow-up</SubmitButton></div>
        </ActionForm>
        <ul className="mt-4 divide-y divide-border text-sm">
          {lead.followUps.map((item) => (
            <li key={item.id} className="py-2">{item.title} · {formatDate(item.dueOn)} · {item.status}</li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Timeline">
        <ol className="space-y-3">
          {lead.activities.map((activity) => (
            <li key={activity.id} className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-medium">{activity.title}</p>
              <p className="text-xs text-muted-foreground">{ACTIVITY_LABELS[activity.type as ActivityType] ?? activity.type} · {formatDateTime(activity.occurredAt)}</p>
              {activity.body ? <p className="mt-1 text-sm">{activity.body}</p> : null}
            </li>
          ))}
        </ol>
      </SectionCard>
      <SectionCard title="Notes">
        <ActionForm action={addNote} className="space-y-3">
          <input type="hidden" name="lead_id" value={lead.id} />
          <textarea className={textareaClass} name="body" required placeholder="Internal note" />
          <SubmitButton>Add note</SubmitButton>
        </ActionForm>
        <ul className="mt-4 space-y-3 text-sm">
          {lead.notes.map((note) => <li key={note.id}><p>{note.body}</p><p className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p></li>)}
        </ul>
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
