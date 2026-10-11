import Link from "next/link";
import { AccountFlagControl, FlagBadge } from "@/components/account-flag-field";
import { controlClass, Field, PageHeader, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MeetingNotesPanel } from "@/components/meeting-notes-panel";
import { Button } from "@/components/ui/button";
import { SendPilotStatusControl } from "@/components/sendpilot-status-field";
import { SALES_BOARD_COUNT_STAGES, OPPORTUNITY_STAGES, STAGE_PLAYBOOK, boardStage, stageLabel, statusDetailLabel } from "@/lib/domain";
import { canMarkFollowUpDone } from "@/lib/attention-queue";
import { resolveNextAction } from "@/lib/next-action";
import { formatDate, formatDateTime } from "@/lib/format";
import { SENDPILOT_UNIBOX_LINK } from "@/lib/sendpilot/app-links";
import { storedLinkedInHref } from "@/lib/domain";
import {
  addNote,
  clearNextActionOverride,
  completeFollowUp,
  createFollowUp,
  reopenFollowUp,
  moveStage,
  saveNextActionOverride,
  startClient,
} from "@/server/actions";
import { ProfileWorkButtons } from "@/components/profile-work-buttons";

const TABS = [
  ["overview", "Overview"],
  ["work", "Work"],
  ["notes", "Notes"],
  ["history", "History"],
  ["details", "Details"],
] as const;

type FollowUp = { id: string; title: string; dueOn: string; status: string; notes?: string | null; automationType?: string | null };

export function AccountProfile({
  canWrite,
  tab,
  hrefBase,
  contactName,
  companyName,
  email,
  phone,
  linkedInUrl,
  sendpilotStatus,
  stage,
  accountFlag,
  nextAction,
  nextActionDate,
  nextActionManual,
  leadId,
  opportunityId,
  followUps,
  notes,
  activities,
  history,
  companyIndustry,
  companyWebsite,
  lostReason,
  talentRequestSentOn,
  strategyNotes,
  recruitmentStatus,
  contractStatus,
  targetStartOn,
  clientStartOn,
  vaCount,
  waitingOn,
  riskLevel,
  notInterestedOutcome,
  today,
}: {
  canWrite: boolean;
  tab: string;
  hrefBase: string;
  contactName: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  linkedInUrl?: string | null;
  sendpilotStatus?: string | null;
  stage?: string | null;
  accountFlag: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  nextActionManual?: boolean;
  leadId: string;
  opportunityId?: string | null;
  followUps: FollowUp[];
  notes: Array<{ id: string; body: string; createdAt?: string | null }>;
  activities: Array<{ id: string; title: string; occurredAt: string }>;
  history?: Array<{ id: string; previousStage: string | null; newStage: string; changedAt: string; note: string | null }>;
  companyIndustry?: string | null;
  companyWebsite?: string | null;
  lostReason?: string | null;
  talentRequestSentOn?: string | null;
  strategyNotes?: string | null;
  recruitmentStatus?: string | null;
  contractStatus?: string | null;
  targetStartOn?: string | null;
  clientStartOn?: string | null;
  vaCount?: number | null;
  waitingOn?: string | null;
  riskLevel?: string | null;
  notInterestedOutcome?: string | null;
  today: string;
}) {
  const currentTab = TABS.some(([key]) => key === tab) ? tab : "overview";
  const openTasks = followUps.filter((item) => item.status === "open");
  const closedTasks = followUps.filter((item) => item.status !== "open").slice(0, 12);
  const resolved = resolveNextAction({
    manual: nextActionManual,
    manualTitle: nextAction,
    manualDate: nextActionDate,
    openItems: openTasks,
    fallbackTitle: nextAction,
    fallbackDate: nextActionDate,
  });
  const linkedInHref = storedLinkedInHref(linkedInUrl ?? null);
  const column = stage ? boardStage(stage as never) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/opportunities", label: "Back to client journey" }}
        eyebrow={companyName && companyName !== contactName ? companyName : undefined}
        title={contactName}
        description={`SendPilot ${sendpilotStatus ?? "not set"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <a href={SENDPILOT_UNIBOX_LINK.href} target={SENDPILOT_UNIBOX_LINK.target} rel={SENDPILOT_UNIBOX_LINK.rel}>Open SendPilot</a>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/leads/${leadId}`}>Source lead</Link>
            </Button>
            {linkedInHref ? (
              <Button variant="outline" asChild>
                <a href={linkedInHref} target="_blank" rel="noopener noreferrer">View LinkedIn</a>
              </Button>
            ) : null}
            <FlagBadge flag={accountFlag as never} />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {stage ? <StageBadge stage={stage as never} /> : <span className="text-sm text-muted-foreground">Not on a later stage yet</span>}
        {stage ? <span className="text-xs text-muted-foreground">Status: {statusDetailLabel(stage)}</span> : null}
      </div>
      {canWrite && opportunityId && stage ? (
        <ActionForm action={moveStage} className="grid max-w-xl gap-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="opportunity_id" value={opportunityId} />
          <input type="hidden" name="next_action" value={nextAction ?? STAGE_PLAYBOOK[stage as keyof typeof STAGE_PLAYBOOK]?.nextAction ?? ""} />
          <input type="hidden" name="next_action_date" value={nextActionDate ?? today} />
          <input type="hidden" name="waiting_on" value={waitingOn ?? "internal"} />
          <input type="hidden" name="risk_level" value={riskLevel ?? "low"} />
          <Field label="Underlying status">
            <select className={controlClass} name="stage" defaultValue={stage}>
              {OPPORTUNITY_STAGES.map((item) => (
                <option key={item} value={item}>{statusDetailLabel(item)}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end"><SubmitButton>Update status</SubmitButton></div>
        </ActionForm>
      ) : null}
      <ol className="flex flex-wrap gap-1">
        {SALES_BOARD_COUNT_STAGES.map((item) => (
          <li
            key={item}
            className={`rounded-full px-2 py-0.5 text-[10px] ${column === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {stageLabel(item)}
          </li>
        ))}
      </ol>
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <p className="text-xs text-muted-foreground uppercase">Next action {resolved.source === "manual" ? "· set manually" : ""}</p>
        <p className="mt-1 font-medium">{resolved.title ?? "Nothing waiting"}</p>
        <p className="text-xs text-muted-foreground">{resolved.dueOn ? `Due ${formatDate(resolved.dueOn)}` : "No due date"}</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`${hrefBase}${key === "overview" ? "" : `?tab=${key}`}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${currentTab === key ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {currentTab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Now" description="What needs attention for this account.">
            <ul className="space-y-2 text-sm">
              {openTasks.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground"> · {formatDate(item.dueOn)}</span>
                </li>
              ))}
              {openTasks.length === 0 ? <li className="text-muted-foreground">No open tasks.</li> : null}
            </ul>
          </SectionCard>
          <SectionCard title="Recent activity">
            <ul className="space-y-2 text-sm">
              {activities.slice(0, 6).map((item) => (
                <li key={item.id}>{item.title}<span className="text-xs text-muted-foreground"> · {formatDateTime(item.occurredAt)}</span></li>
              ))}
              {activities.length === 0 ? <li className="text-muted-foreground">Nothing logged yet.</li> : null}
            </ul>
          </SectionCard>
        </div>
      ) : null}

      {currentTab === "work" ? (
        <div className="space-y-4">
          <SectionCard title="Tasks" description="One list. Done here also updates the calendar.">
            {canWrite ? (
              <ActionForm action={createFollowUp} className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
                <input type="hidden" name="lead_id" value={leadId} />
                <Field label="Task"><input className={controlClass} name="title" required /></Field>
                <Field label="Due"><input className={controlClass} name="due_on" type="date" required defaultValue={today} /></Field>
                <div className="flex items-end"><SubmitButton>Add</SubmitButton></div>
              </ActionForm>
            ) : null}
            <ul className="divide-y divide-border text-sm">
              {openTasks.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <span>
                    <span className="font-medium">{item.title}</span>
                    <p className="text-xs text-muted-foreground">{item.notes === "Pending schedule" ? "Pending schedule" : `Due ${formatDate(item.dueOn)}`}</p>
                  </span>
                  {canWrite && canMarkFollowUpDone(item.automationType) ? (
                    <form action={completeFollowUp}>
                      <input type="hidden" name="follow_up_id" value={item.id} />
                      {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
                      <input type="hidden" name="lead_id" value={leadId} />
                      <SubmitButton variant="outline">Mark Done</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {closedTasks.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {closedTasks.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>{item.status === "cancelled" ? "Canceled" : "Done"} · {item.title} · {formatDate(item.dueOn)}</span>
                    {canWrite && item.status === "completed" ? (
                      <form action={reopenFollowUp}>
                        <input type="hidden" name="follow_up_id" value={item.id} />
                        <SubmitButton variant="outline">Reopen</SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>
          {canWrite && opportunityId ? (
            <SectionCard title="Next action override" description="Automatic next action follows the earliest open task unless you set one yourself.">
              <ActionForm action={saveNextActionOverride} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="opportunity_id" value={opportunityId} />
                <Field label="Manual next action"><input className={controlClass} name="next_action" defaultValue={resolved.title ?? ""} required /></Field>
                <Field label="Due"><input className={controlClass} name="next_action_date" type="date" defaultValue={resolved.dueOn ?? ""} /></Field>
                <div className="flex items-end gap-2">
                  <SubmitButton>Set</SubmitButton>
                </div>
              </ActionForm>
              {nextActionManual ? (
                <ActionForm action={clearNextActionOverride} className="mt-3">
                  <input type="hidden" name="opportunity_id" value={opportunityId} />
                  <SubmitButton variant="outline">Use earliest task again</SubmitButton>
                </ActionForm>
              ) : null}
            </SectionCard>
          ) : null}
          {canWrite && opportunityId ? (
            <SectionCard title="Journey actions" description="These open the same dialogs as the board. Automation runs after you save.">
              <WorkActions leadId={leadId} opportunityId={opportunityId} companyName={companyName} contactName={contactName} />
            </SectionCard>
          ) : null}
          {stage === "Strategy Call Scheduled" || stage === "Strategy Call Complete" || stage === "Requirements Captured" || stage === "Recruitment" ? (
            <SectionCard title="Meeting notes">
              <MeetingNotesPanel clientName={contactName} companyName={companyName} />
            </SectionCard>
          ) : null}
          {stage === "Client Started" || stage === "Onboarding" || stage === "Won" ? (
            <SectionCard title="Client start">
              {clientStartOn ? (
                <p className="text-sm">Started {formatDate(clientStartOn)} · {vaCount ?? "—"} VAs</p>
              ) : canWrite ? (
                <ActionForm action={startClient} className="grid gap-3 md:grid-cols-3">
                  <input type="hidden" name="opportunity_id" value={opportunityId ?? ""} />
                  <Field label="Start date"><input className={controlClass} type="date" name="start_date" required /></Field>
                  <Field label="Number of VAs"><input className={controlClass} name="number_of_vas" defaultValue="1" required /></Field>
                  <div className="flex items-end"><SubmitButton>Mark started</SubmitButton></div>
                </ActionForm>
              ) : <p className="text-sm text-muted-foreground">Client start has not been recorded.</p>}
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {currentTab === "notes" ? (
        <SectionCard title="Notes">
          {strategyNotes ? <p className="mb-4 whitespace-pre-wrap text-sm">{strategyNotes}</p> : null}
          {canWrite ? (
            <ActionForm action={addNote} className="space-y-3">
              {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
              <input type="hidden" name="lead_id" value={leadId} />
              <textarea className={textareaClass} name="body" required placeholder="Sales call notes, meeting notes, or anything to remember" />
              <SubmitButton>Add note</SubmitButton>
            </ActionForm>
          ) : null}
          <ul className="mt-4 space-y-3 text-sm">
            {notes.map((note) => (
              <li key={note.id}>
                <p>{note.body}</p>
                {note.createdAt ? <p className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p> : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {currentTab === "history" ? (
        <SectionCard title="History">
          <ol className="space-y-3">
            {(history ?? []).map((item) => (
              <li key={item.id} className="text-sm">
                {item.previousStage ?? "—"} → {statusDetailLabel(item.newStage)}
                <span className="text-xs text-muted-foreground"> · {formatDateTime(item.changedAt)}</span>
                {item.note ? <p className="text-muted-foreground">{item.note}</p> : null}
              </li>
            ))}
            {closedTasks.map((item) => (
              <li key={`task-${item.id}`} className="text-sm">{item.status === "cancelled" ? "Canceled" : "Completed"} · {item.title}<span className="text-xs text-muted-foreground"> · {formatDate(item.dueOn)}</span></li>
            ))}
            {activities.map((item) => (
              <li key={item.id} className="text-sm">{item.title}<span className="text-xs text-muted-foreground"> · {formatDateTime(item.occurredAt)}</span></li>
            ))}
          </ol>
        </SectionCard>
      ) : null}

      {currentTab === "details" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Contact">
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-xs text-muted-foreground uppercase">Email</dt><dd>{email ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Phone</dt><dd>{phone ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">LinkedIn</dt><dd>{linkedInHref ? <a className="text-primary underline" href={linkedInHref}>Profile</a> : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Industry</dt><dd>{companyIndustry ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Website</dt><dd>{companyWebsite ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Flag</dt><dd>{canWrite ? <AccountFlagControl leadId={leadId} opportunityId={opportunityId ?? undefined} value={accountFlag as never} /> : accountFlag ?? "None"}</dd></div>
              {lostReason ? <div><dt className="text-xs text-muted-foreground uppercase">Lost reason</dt><dd>{lostReason}</dd></div> : null}
              {recruitmentStatus ? <div><dt className="text-xs text-muted-foreground uppercase">Recruitment</dt><dd>{recruitmentStatus}{talentRequestSentOn ? ` · sent ${formatDate(talentRequestSentOn)}` : " · draft or not sent"}</dd></div> : null}
              {contractStatus ? <div><dt className="text-xs text-muted-foreground uppercase">SOW</dt><dd>{contractStatus}{targetStartOn ? ` · start ${formatDate(targetStartOn)}` : ""}</dd></div> : null}
            </dl>
          </SectionCard>
          <SectionCard title="SendPilot status">
            <SendPilotStatusControl
              leadId={leadId}
              status={(sendpilotStatus as never) ?? null}
              outcome={(notInterestedOutcome as never) ?? null}
              readOnly={!canWrite}
            />
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

function WorkActions({
  leadId,
  opportunityId,
  companyName,
  contactName,
}: {
  leadId: string;
  opportunityId: string;
  companyName: string;
  contactName: string;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-muted-foreground">Use Client journey to drag a card, or record the same actions here.</p>
      <div className="flex flex-wrap gap-2">
        <ProfileWorkButtons leadId={leadId} opportunityId={opportunityId} companyName={companyName} contactName={contactName} />
      </div>
    </div>
  );
}
