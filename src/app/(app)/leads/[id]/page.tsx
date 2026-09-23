import Link from "next/link";
import { notFound } from "next/navigation";
import { controlClass, Field, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ACTIVITY_LABELS, NURTURE_REASON_SUGGESTIONS, OPPORTUNITY_STAGES, SENDPILOT_STATUSES, STAGE_PLAYBOOK, type ActivityType } from "@/lib/domain";
import { getLead } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { addNote, completeFollowUp, createFollowUp, createOpportunity, updateLeadStatus } from "@/server/actions";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const openOpportunity = lead.opportunities.find((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold");
  const nextFollowUp = lead.followUps.find((item) => item.status === "open");
  const lastActivity = lead.activities[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Lead workspace"
        title={lead.contact.name}
        description={`${lead.company.name}${lead.contact.title ? ` · ${lead.contact.title}` : ""}`}
        actions={openOpportunity ? <Link className="text-sm text-primary underline" href={`/opportunities/${openOpportunity.id}`}>Open opportunity</Link> : null}
      />
      <section className="grid gap-3 rounded-xl border border-border bg-card px-4 py-4 sm:grid-cols-4">
        <Summary label="Source status" value={lead.sendpilotStatus ?? lead.rawStatus ?? "Unknown"} />
        <Summary label="Last activity" value={lastActivity ? lastActivity.title : "None yet"} detail={formatDateTime(lastActivity?.occurredAt)} />
        <Summary label="Next follow-up" value={nextFollowUp ? nextFollowUp.title : "Not scheduled"} detail={formatDate(nextFollowUp?.dueOn)} />
        <Summary label="Opportunity" value={openOpportunity?.stage ?? "Not found"} detail={openOpportunity ? formatDate(openOpportunity.nextActionDate) : "Create one if this lead is meaningful"} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Update status" description="Change the recorded SendPilot status here. This is internal tracking, not a live SendPilot write.">
          <ActionForm action={updateLeadStatus} className="grid gap-3">
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Status">
              <select className={controlClass} name="sendpilot_status" defaultValue={lead.sendpilotStatus ?? ""}>
                <option value="">Unknown</option>
                {SENDPILOT_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="Note about the change"><textarea className={textareaClass} name="note" placeholder="Optional. Kept on the timeline." /></Field>
            <SubmitButton>Save status</SubmitButton>
          </ActionForm>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={lead.contact.email ?? "—"} />
            <Info label="Phone" value={lead.contact.phone ?? "—"} />
            <Info label="LinkedIn" value={lead.contact.linkedinUrl ?? "—"} />
            <Info label="Source" value={lead.source} />
            <Info label="Last SendPilot sync" value={formatDateTime(lead.lastSyncedAt)} />
            <Info label="Review" value={lead.requiresReview ? lead.reviewReason ?? "Needs review" : "Clear"} />
          </dl>
        </SectionCard>
        <SectionCard title="Schedule a follow-up" description="Set a reminder for this lead. It appears on the week calendar and the command center when the date arrives.">
          <ActionForm action={createFollowUp} className="grid gap-3">
            <input type="hidden" name="lead_id" value={lead.id} />
            {openOpportunity ? <input type="hidden" name="opportunity_id" value={openOpportunity.id} /> : null}
            <Field label="What to do"><input className={controlClass} name="title" required placeholder="Call back, send the profile, check timing" /></Field>
            <Field label="Remind me on"><input className={controlClass} name="due_on" type="date" required /></Field>
            <Field label="Reason"><input className={controlClass} name="reason" list="reasons" placeholder="Timing, budget, or your own note" /></Field>
            <datalist id="reasons">{NURTURE_REASON_SUGGESTIONS.map((reason) => <option key={reason} value={reason} />)}</datalist>
            <Field label="Notes"><textarea className={textareaClass} name="notes" /></Field>
            <SubmitButton>Schedule reminder</SubmitButton>
          </ActionForm>
          <ul className="mt-4 divide-y divide-border text-sm">
            {lead.followUps.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.dueOn)} · {item.status}{item.reason ? ` · ${item.reason}` : ""}</p>
                  {item.notes ? <p className="mt-1 text-sm">{item.notes}</p> : null}
                </div>
                {item.status === "open" ? (
                  <form action={completeFollowUp}>
                    <input type="hidden" name="follow_up_id" value={item.id} />
                    <input type="hidden" name="lead_id" value={lead.id} />
                    {openOpportunity ? <input type="hidden" name="opportunity_id" value={openOpportunity.id} /> : null}
                    <SubmitButton variant="outline">Complete</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
            {lead.followUps.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No reminders yet.</li> : null}
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="Notes" description="Internal notes stay on this lead. They are never overwritten.">
        <ActionForm action={addNote} className="space-y-3">
          <input type="hidden" name="lead_id" value={lead.id} />
          <textarea className={textareaClass} name="body" required placeholder="What you heard, promised, or need to remember" />
          <SubmitButton>Add note</SubmitButton>
        </ActionForm>
        <ul className="mt-4 space-y-3 text-sm">
          {lead.notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border px-3 py-2">
              <p>{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
            </li>
          ))}
          {lead.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
        </ul>
      </SectionCard>
      <div className="grid gap-4 lg:grid-cols-2">
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
        <SectionCard title="External / source data" description="Came from SendPilot or the import file. This is not the sales pipeline.">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="SendPilot status" value={lead.sendpilotStatus ?? lead.rawStatus ?? "Unknown"} />
            <Info label="Source file / campaign" value={lead.source} />
            <Info label="Company" value={lead.company.name} />
            <Info label="Contact" value={lead.contact.name} />
          </dl>
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
            <Field label="Notes"><textarea className={textareaClass} name="nurture_notes" /></Field>
            <div className="md:col-span-2"><SubmitButton>Create opportunity</SubmitButton></div>
          </ActionForm>
        </SectionCard>
      ) : null}
      <SectionCard title="Timeline">
        <ol className="space-y-3">
          {lead.activities.map((activity) => (
            <li key={activity.id} className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-medium">{activity.title}</p>
              <p className="text-xs text-muted-foreground">{ACTIVITY_LABELS[activity.type as ActivityType] ?? activity.type} · {formatDateTime(activity.occurredAt)}</p>
              {activity.body ? <p className="mt-1 text-sm">{activity.body}</p> : null}
            </li>
          ))}
          {lead.activities.length === 0 ? <li className="text-sm text-muted-foreground">No activity yet.</li> : null}
        </ol>
      </SectionCard>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
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
