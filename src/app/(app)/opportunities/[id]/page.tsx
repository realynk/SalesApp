import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountFlagControl, FlagBadge } from "@/components/account-flag-field";
import { controlClass, Field, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import {
  OPPORTUNITY_STAGES,
  STAGE_PLAYBOOK,
  isHiddenBoardStage,
  stageLabel,
} from "@/lib/domain";
import { getOpportunity } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  addNote,
  completeFollowUp,
  createFollowUp,
  moveStage,
  startClient,
} from "@/server/actions";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [opportunity, session] = await Promise.all([getOpportunity(id), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
  if (!opportunity) notFound();
  const playbook = STAGE_PLAYBOOK[opportunity.stage];
  const openTasks = opportunity.followUps.filter((item) => item.status === "open");
  const doneTasks = opportunity.followUps.filter((item) => item.status !== "open").slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/opportunities", label: "Back to client journey" }}
        eyebrow={opportunity.contactName}
        title={opportunity.companyName}
        description={`SendPilot ${opportunity.sendpilotStatus ?? "not set"}`}
        actions={<Link className="text-sm text-primary underline" href={`/leads/${opportunity.leadId}`}>Source lead</Link>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge stage={opportunity.stage} />
        <FlagBadge flag={opportunity.accountFlag} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Where they are" description="Stage, next action, and a flag. That is enough to keep the journey moving.">
          {canWrite ? (
          <ActionForm action={moveStage} className="grid gap-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <input type="hidden" name="waiting_on" value={opportunity.waitingOn} />
            <input type="hidden" name="risk_level" value={opportunity.riskLevel} />
            <Field label="Stage">
              <select className={controlClass} name="stage" defaultValue={opportunity.stage}>
                {OPPORTUNITY_STAGES.filter((stage) => !isHiddenBoardStage(stage) || stage === opportunity.stage).map((stage) => (
                  <option key={stage} value={stage}>{stageLabel(stage)}</option>
                ))}
              </select>
            </Field>
            <Field label="Next action">
              <input className={controlClass} name="next_action" defaultValue={opportunity.nextAction ?? playbook.nextAction} required />
            </Field>
            <Field label="Remind me on">
              <input className={controlClass} name="next_action_date" type="date" defaultValue={opportunity.nextActionDate ?? ""} />
            </Field>
            <Field label="Flag">
              <AccountFlagControl leadId={opportunity.leadId} opportunityId={opportunity.id} value={opportunity.accountFlag} />
            </Field>
            <Field label="Lost reason (only if moving to Lost)">
              <input className={controlClass} name="lost_reason" defaultValue={opportunity.lostReason ?? ""} />
            </Field>
            <SubmitButton>Save stage and next action</SubmitButton>
          </ActionForm>
          ) : (
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-xs text-muted-foreground uppercase">Stage</dt><dd>{stageLabel(opportunity.stage)}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Next action</dt><dd>{opportunity.nextAction ?? "None"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Remind me on</dt><dd>{formatDate(opportunity.nextActionDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Flag</dt><dd>{opportunity.accountFlag ?? "None"}</dd></div>
            </dl>
          )}
        </SectionCard>
        <SectionCard title="Tasks" description={canWrite ? "These show on the week calendar. Mark them done when finished." : "These show on the week calendar."}>
          {canWrite ? (
          <ActionForm action={createFollowUp} className="grid gap-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <input type="hidden" name="lead_id" value={opportunity.leadId} />
            <Field label="Task"><input className={controlClass} name="title" required placeholder="Check back, send notes, book the call" /></Field>
            <Field label="Due"><input className={controlClass} name="due_on" type="date" required defaultValue={opportunity.today} /></Field>
            <SubmitButton>Add task</SubmitButton>
          </ActionForm>
          ) : null}
          <ul className="mt-4 divide-y divide-border text-sm">
            {openTasks.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{item.title}</span>
                  <p className="text-xs text-muted-foreground">Due {formatDate(item.dueOn)}</p>
                </span>
                {canWrite ? (
                <form action={completeFollowUp}>
                  <input type="hidden" name="follow_up_id" value={item.id} />
                  <input type="hidden" name="opportunity_id" value={opportunity.id} />
                  <SubmitButton variant="outline">Done</SubmitButton>
                </form>
                ) : null}
              </li>
            ))}
            {openTasks.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No open tasks.</li> : null}
          </ul>
          {doneTasks.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {doneTasks.map((item) => (
                <li key={item.id}>Done · {item.title} · {formatDate(item.dueOn)}</li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      </div>
      {opportunity.stage === "Client Started" || opportunity.stage === "Onboarding" || opportunity.stage === "Won" ? (
        <SectionCard title="Client start" description="Record the start date when they begin.">
          {opportunity.client ? (
            <p className="text-sm">Started {formatDate(String(opportunity.client.start_date ?? ""))} · {String(opportunity.client.number_of_vas ?? "—")} VAs</p>
          ) : canWrite ? (
            <ActionForm action={startClient} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="opportunity_id" value={opportunity.id} />
              <Field label="Start date"><input className={controlClass} type="date" name="start_date" required /></Field>
              <Field label="Number of VAs"><input className={controlClass} name="number_of_vas" defaultValue={String(opportunity.headcount ?? 1)} required /></Field>
              <div className="flex items-end"><SubmitButton>Mark started</SubmitButton></div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">Client start has not been recorded.</p>
          )}
        </SectionCard>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Notes">
          {canWrite ? (
          <ActionForm action={addNote} className="space-y-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <textarea className={textareaClass} name="body" required placeholder="Anything you need to remember" />
            <SubmitButton>Add note</SubmitButton>
          </ActionForm>
          ) : null}
          <ul className="mt-4 space-y-3 text-sm">
            {opportunity.notes.map((note) => (
              <li key={note.id}>
                <p>{note.body}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
              </li>
            ))}
            {opportunity.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
          </ul>
        </SectionCard>
        <SectionCard title="Recent activity">
          <ol className="space-y-3">
            {opportunity.activities.slice(0, 10).map((activity) => (
              <li key={activity.id} className="border-l-2 border-primary/30 pl-3">
                <p className="text-sm font-medium">{activity.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(activity.occurredAt)}</p>
              </li>
            ))}
            {opportunity.activities.length === 0 ? <li className="text-sm text-muted-foreground">Nothing logged yet. Moving a card on the board writes the history.</li> : null}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
