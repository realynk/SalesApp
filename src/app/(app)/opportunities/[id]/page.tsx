import Link from "next/link";
import { notFound } from "next/navigation";
import { controlClass, Field, journey, PageHeader, RiskBadge, SectionCard, StageBadge, textareaClass } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  CANDIDATE_STATUSES,
  CONTRACT_STATUSES,
  INTERVIEW_STATUSES,
  NURTURE_REASON_SUGGESTIONS,
  OPPORTUNITY_STAGES,
  RISK_LEVELS,
  STAGE_PLAYBOOK,
  WAITING_ON,
  isHiddenBoardStage,
  stageLabel,
  potentialArr,
  type ActivityType,
} from "@/lib/domain";
import { getOpportunity } from "@/lib/data";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  addCandidate,
  addNote,
  addTask,
  logActivity,
  moveStage,
  recordClientResponse,
  recordProfileBatch,
  saveContract,
  saveInterview,
  saveStrategyCall,
  sendToRecruitment,
  startClient,
  updateCandidate,
  updateNextAction,
  uploadDocument,
  createFollowUp,
  completeFollowUp,
} from "@/server/actions";

const TABS = [
  ["overview", "Overview"],
  ["timeline", "Timeline"],
  ["strategy", "Strategy Call"],
  ["recruitment", "Recruitment"],
  ["interviews", "Interviews"],
  ["sow", "SOW"],
  ["follow-ups", "Follow-ups"],
  ["notes", "Notes"],
  ["documents", "Documents"],
] as const;

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();
  const tab = TABS.some((item) => item[0] === query.tab) ? query.tab : "overview";
  const playbook = STAGE_PLAYBOOK[opportunity.stage];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/opportunities", label: "Back to client journey" }}
        eyebrow={opportunity.contactName}
        title={opportunity.companyName}
        description={opportunity.title}
        actions={<Link className="text-sm text-primary underline" href={`/leads/${opportunity.leadId}`}>Source lead</Link>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge stage={opportunity.stage} />
        <RiskBadge risk={opportunity.riskLevel} />
        <span className="text-sm text-muted-foreground">Potential MRR {formatMoney(opportunity.mrr)} · ARR {formatMoney(potentialArr(opportunity.mrr))}</span>
        <span className="text-sm text-muted-foreground">Owner {opportunity.ownerName ?? "Unassigned"}</span>
      </div>
      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-6">
        {journey(opportunity.stage, opportunity.lastActivitySummary, opportunity.nextAction, opportunity.nextActionDate, opportunity.ownerName, opportunity.riskLevel).map(([label, value]) => (
          <div key={label}>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 text-sm font-medium">{value}</p>
          </div>
        ))}
      </section>
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/opportunities/${opportunity.id}?tab=${key}`} className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? <Overview opportunity={opportunity} playbook={playbook} /> : null}
      {tab === "timeline" ? <Timeline opportunity={opportunity} /> : null}
      {tab === "strategy" ? <Strategy opportunity={opportunity} /> : null}
      {tab === "recruitment" ? <Recruitment opportunity={opportunity} /> : null}
      {tab === "interviews" ? <Interviews opportunity={opportunity} /> : null}
      {tab === "sow" ? <Sow opportunity={opportunity} /> : null}
      {tab === "follow-ups" ? <FollowUps opportunity={opportunity} /> : null}
      {tab === "notes" ? <Notes opportunity={opportunity} /> : null}
      {tab === "documents" ? <Documents opportunity={opportunity} /> : null}
    </div>
  );
}

type OpportunityRecord = NonNullable<Awaited<ReturnType<typeof getOpportunity>>>;

function field(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value == null ? "" : String(value);
}

function Overview({ opportunity, playbook }: { opportunity: OpportunityRecord; playbook: { nextAction: string; waitingOn: string } }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="What's next" description="This is the current commitment. Changing it does not erase history.">
        <ActionForm action={updateNextAction} className="grid gap-3">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
          <Field label="Next action"><input className={controlClass} name="next_action" defaultValue={opportunity.nextAction ?? playbook.nextAction} required /></Field>
          <Field label="Due date"><input className={controlClass} name="next_action_date" type="date" defaultValue={opportunity.nextActionDate ?? opportunity.today} required /></Field>
          <Field label="Waiting on">
            <select className={controlClass} name="waiting_on" defaultValue={opportunity.waitingOn}>
              {WAITING_ON.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Risk">
            <select className={controlClass} name="risk_level" defaultValue={opportunity.riskLevel}>
              {RISK_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <SubmitButton>Save next action</SubmitButton>
        </ActionForm>
      </SectionCard>
      <SectionCard title="Move stage" description="Forward or backward. The previous stage stays in the history.">
        <ActionForm action={moveStage} className="grid gap-3">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
          <Field label="Stage">
            <select className={controlClass} name="stage" defaultValue={opportunity.stage}>
              {OPPORTUNITY_STAGES.filter((stage) => !isHiddenBoardStage(stage) || stage === opportunity.stage).map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
            </select>
          </Field>
          <Field label="Next action"><input className={controlClass} name="next_action" defaultValue={opportunity.nextAction ?? ""} /></Field>
          <Field label="Due date"><input className={controlClass} name="next_action_date" type="date" defaultValue={opportunity.nextActionDate ?? ""} /></Field>
          <Field label="Waiting on">
            <select className={controlClass} name="waiting_on" defaultValue={opportunity.waitingOn}>{WAITING_ON.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </Field>
          <Field label="Risk">
            <select className={controlClass} name="risk_level" defaultValue={opportunity.riskLevel}>{RISK_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </Field>
          <Field label="Lost reason"><input className={controlClass} name="lost_reason" defaultValue={opportunity.lostReason ?? ""} placeholder="Required only when moving to Lost" /></Field>
          <Field label="Note"><input className={controlClass} name="note" placeholder="Optional note stored with the stage change" /></Field>
          <SubmitButton>Move stage</SubmitButton>
        </ActionForm>
        <p className="mt-3 text-xs text-muted-foreground">Client Started is recorded from the SOW tab so start date, VA count, and billing rate are captured.</p>
      </SectionCard>
      <SectionCard title="Source vs internal">
        <p className="text-sm">SendPilot status: <strong>{opportunity.sendpilotStatus ?? "Not set"}</strong></p>
        <p className="mt-1 text-sm text-muted-foreground">Source {opportunity.sendpilotSource ?? "—"} · synced {formatDateTime(opportunity.lastSyncedAt)}</p>
        <p className="mt-3 text-sm">Internal stage: <strong>{opportunity.stage}</strong></p>
        {opportunity.nurtureReason ? <p className="mt-2 text-sm">Nurture reason: {opportunity.nurtureReason}. {opportunity.notesText}</p> : null}
      </SectionCard>
      <SectionCard title="Tasks">
        <ActionForm action={addTask} className="grid gap-3">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
          <Field label="Task"><input className={controlClass} name="title" required /></Field>
          <Field label="Due"><input className={controlClass} name="due_on" type="date" /></Field>
          <SubmitButton>Add task</SubmitButton>
        </ActionForm>
        <ul className="mt-3 space-y-2 text-sm">{opportunity.tasks.map((task) => <li key={task.id}>{task.title} · {formatDate(task.dueOn)} · {task.status}</li>)}</ul>
      </SectionCard>
    </div>
  );
}

function Timeline({ opportunity }: { opportunity: OpportunityRecord }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <SectionCard title="Activity" description="Events are appended. Editing a record does not rewrite these.">
        <ol className="space-y-4">
          {opportunity.activities.map((activity) => (
            <li key={activity.id} className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-medium">{activity.title}</p>
              <p className="text-xs text-muted-foreground">{ACTIVITY_LABELS[activity.type as ActivityType] ?? activity.type} · {formatDateTime(activity.occurredAt)}</p>
              {activity.body ? <p className="mt-1 text-sm">{activity.body}</p> : null}
            </li>
          ))}
        </ol>
      </SectionCard>
      <div className="space-y-4">
        <SectionCard title="Log an event">
          <ActionForm action={logActivity} className="grid gap-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <input type="hidden" name="lead_id" value={opportunity.leadId} />
            <Field label="Type">
              <select className={controlClass} name="type">{ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{ACTIVITY_LABELS[type]}</option>)}</select>
            </Field>
            <Field label="Title"><input className={controlClass} name="title" required /></Field>
            <Field label="When"><input className={controlClass} name="occurred_at" type="datetime-local" /></Field>
            <Field label="Details"><textarea className={textareaClass} name="body" /></Field>
            <SubmitButton>Record</SubmitButton>
          </ActionForm>
        </SectionCard>
        <SectionCard title="Stage history">
          <ul className="space-y-2 text-sm">
            {opportunity.history.map((item) => (
              <li key={item.id}>{item.previousStage ?? "—"} → {item.newStage}<p className="text-xs text-muted-foreground">{formatDateTime(item.changedAt)} {item.note ? `· ${item.note}` : ""}</p></li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function Strategy({ opportunity }: { opportunity: OpportunityRecord }) {
  const call = opportunity.strategyCall;
  return (
    <SectionCard title="Strategy call" description="Stored on this opportunity and copied into recruitment. The sales lead does not re-enter it later.">
      <ActionForm action={saveStrategyCall} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="opportunity_id" value={opportunity.id} />
        <Field label="Strategy call date"><input className={controlClass} type="date" name="call_on" defaultValue={field(call, "call_on").slice(0, 10)} /></Field>
        <Field label="Status">
          <select className={controlClass} name="status" defaultValue={field(call, "status") || "Draft"}>
            {["Draft", "Scheduled", "Complete", "Cancelled"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <Field label="Client name"><input className={controlClass} name="client_name" defaultValue={field(call, "client_name") || opportunity.contactName} /></Field>
        <Field label="Company"><input className={controlClass} name="company_name" defaultValue={field(call, "company_name") || opportunity.companyName} /></Field>
        <Field label="Headcount requirement"><input className={controlClass} name="headcount_requirement" defaultValue={field(call, "headcount_requirement") || opportunity.headcount || ""} /></Field>
        <Field label="Number of positions"><input className={controlClass} name="number_of_positions" defaultValue={field(call, "number_of_positions")} /></Field>
        <Field label="Work arrangement"><input className={controlClass} name="work_arrangement" defaultValue={field(call, "work_arrangement")} /></Field>
        <Field label="Schedule"><input className={controlClass} name="schedule" defaultValue={field(call, "schedule")} /></Field>
        <Field label="Full-time / part-time"><input className={controlClass} name="employment_type" defaultValue={field(call, "employment_type")} /></Field>
        <Field label="Time zone"><input className={controlClass} name="timezone" defaultValue={field(call, "timezone")} /></Field>
        <Field label="Preferred virtual staff"><input className={controlClass} name="preferred_virtual_staff" defaultValue={field(call, "preferred_virtual_staff")} /></Field>
        <Field label="Tools"><input className={controlClass} name="tools" defaultValue={field(call, "tools")} /></Field>
        <Field label="Start date target"><input className={controlClass} type="date" name="start_date_target" defaultValue={field(call, "start_date_target").slice(0, 10)} /></Field>
        <Field label="Client billing rate"><input className={controlClass} name="client_billing_rate" defaultValue={field(call, "client_billing_rate") || opportunity.billingRate || ""} /></Field>
        <Field label="Current staffing situation"><textarea className={textareaClass} name="current_staffing" defaultValue={field(call, "current_staffing")} /></Field>
        <Field label="Reason for hiring"><textarea className={textareaClass} name="reason_for_hiring" defaultValue={field(call, "reason_for_hiring")} /></Field>
        <Field label="Main pain point"><textarea className={textareaClass} name="main_pain_point" defaultValue={field(call, "main_pain_point")} /></Field>
        <Field label="Urgency"><input className={controlClass} name="urgency" defaultValue={field(call, "urgency")} /></Field>
        <Field label="Budget"><input className={controlClass} name="budget" defaultValue={field(call, "budget")} /></Field>
        <Field label="Decision maker"><input className={controlClass} name="decision_maker" defaultValue={field(call, "decision_maker")} /></Field>
        <Field label="Decision timeline"><input className={controlClass} name="decision_timeline" defaultValue={field(call, "decision_timeline")} /></Field>
        <Field label="Tasks"><textarea className={textareaClass} name="tasks" defaultValue={field(call, "tasks")} /></Field>
        <Field label="Ideal candidate"><textarea className={textareaClass} name="ideal_candidate" defaultValue={field(call, "ideal_candidate")} /></Field>
        <Field label="Deal breakers"><textarea className={textareaClass} name="deal_breakers" defaultValue={field(call, "deal_breakers")} /></Field>
        <Field label="Special requirements"><textarea className={textareaClass} name="special_requirements" defaultValue={field(call, "special_requirements")} /></Field>
        <Field label="Notes"><textarea className={textareaClass} name="notes" defaultValue={field(call, "notes")} /></Field>
        <div className="md:col-span-2"><SubmitButton>Save strategy call</SubmitButton></div>
      </ActionForm>
    </SectionCard>
  );
}

function Recruitment({ opportunity }: { opportunity: OpportunityRecord }) {
  const request = opportunity.recruitment;
  const candidates = opportunity.candidates;
  return (
    <div className="space-y-4">
      {!request ? (
        <SectionCard title="Send to recruitment" description="Copies the strategy call and opportunity. The sales lead does not retype the brief.">
          <ActionForm action={sendToRecruitment} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <Field label="Custom target date"><input className={controlClass} type="date" name="target_on" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgent" value="yes" /> Urgent — use the custom target instead of the default business-day window</label>
            <div className="md:col-span-2"><SubmitButton>Send to recruitment</SubmitButton></div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted-foreground">Default target is {opportunity.settings.recruitmentTargetBusinessDays} business days when no custom date is set.</p>
        </SectionCard>
      ) : (
        <SectionCard title={field(request, "company_name") || opportunity.companyName} description={`Recruitment status ${field(request, "status")} · target ${formatDate(field(request, "target_on"))}`}>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            {["headcount", "work_arrangement", "schedule", "preferred_staff", "tools", "billing_rate", "ideal_candidate", "deal_breakers", "tasks", "notes"].map((key) => (
              <div key={key}><dt className="text-xs text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd>{field(request, key) || "—"}</dd></div>
            ))}
          </dl>
        </SectionCard>
      )}
      {request ? (
        <SectionCard title="Candidates">
          <ul className="divide-y divide-border">
            {candidates.map((candidate) => (
              <li key={field(candidate, "id")} className="py-3">
                <p className="font-medium">{field(candidate, "name")}</p>
                <p className="text-xs text-muted-foreground">{field(candidate, "status")} · added {formatDate(field(candidate, "date_added"))} · sent {formatDate(field(candidate, "date_sent_to_client"))}</p>
                <ActionForm action={updateCandidate} className="mt-2 grid gap-2 md:grid-cols-4">
                  <input type="hidden" name="candidate_id" value={field(candidate, "id")} />
                  <input type="hidden" name="opportunity_id" value={opportunity.id} />
                  <input type="hidden" name="recruitment_id" value={field(request, "id")} />
                  <select className={controlClass} name="status" defaultValue={field(candidate, "status")}>{CANDIDATE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
                  <input className={controlClass} name="client_feedback" defaultValue={field(candidate, "client_feedback")} placeholder="Client feedback" />
                  <input className={controlClass} name="notes" defaultValue={field(candidate, "notes")} placeholder="Notes" />
                  <SubmitButton>Update</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={addCandidate} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="recruitment_id" value={field(request, "id")} />
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <Field label="Name"><input className={controlClass} name="name" required /></Field>
            <Field label="Email"><input className={controlClass} name="email" type="email" /></Field>
            <Field label="Phone"><input className={controlClass} name="phone" /></Field>
            <Field label="Notes"><input className={controlClass} name="notes" /></Field>
            <div className="md:col-span-2"><SubmitButton>Add candidate</SubmitButton></div>
          </ActionForm>
        </SectionCard>
      ) : null}
      <SectionCard title="Profiles sent to the client" description="Days waiting are calculated from the sent date until a response is recorded.">
        <ul className="space-y-3 text-sm">
          {opportunity.batches.map((batch) => {
            const sent = field(batch, "sent_on");
            const response = field(batch, "client_response");
            const waiting = sent ? Math.max(0, Math.round((Date.parse(opportunity.today) - Date.parse(sent)) / 86_400_000)) : 0;
            return (
              <li key={field(batch, "id")} className="rounded-lg border border-border p-3">
                <p className="font-medium">{field(batch, "profile_count")} profiles sent · {formatDate(sent)}</p>
                <p className="text-muted-foreground">{response ? `Response: ${response}` : `No response · ${waiting} days waiting`} · follow-up {formatDate(field(batch, "follow_up_on"))}</p>
                {!response ? (
                  <ActionForm action={recordClientResponse} className="mt-2 flex gap-2">
                    <input type="hidden" name="batch_id" value={field(batch, "id")} />
                    <input type="hidden" name="opportunity_id" value={opportunity.id} />
                    <input className={controlClass} name="client_response" placeholder="Client response" required />
                    <SubmitButton>Save response</SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
        {candidates.length > 0 && request ? (
          <ActionForm action={recordProfileBatch} className="mt-4 space-y-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <input type="hidden" name="recruitment_id" value={field(request, "id")} />
            <div className="grid gap-2">
              {candidates.map((candidate) => (
                <label key={field(candidate, "id")} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="candidate_id" value={field(candidate, "id")} />
                  {field(candidate, "name")}
                </label>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Date sent"><input className={controlClass} type="date" name="sent_on" defaultValue={opportunity.today} required /></Field>
              <Field label="Follow-up date"><input className={controlClass} type="date" name="follow_up_on" /></Field>
            </div>
            <Field label="Notes"><textarea className={textareaClass} name="notes" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="move_stage" value="yes" defaultChecked /> Move opportunity to Profiles Sent</label>
            <SubmitButton>Record profiles sent</SubmitButton>
          </ActionForm>
        ) : null}
      </SectionCard>
    </div>
  );
}

function Interviews({ opportunity }: { opportunity: OpportunityRecord }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Schedule or update an interview">
        <ActionForm action={saveInterview} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
          <Field label="Candidate">
            <input className={controlClass} name="candidate_name" list="candidate-names" required />
            <datalist id="candidate-names">{opportunity.candidates.map((candidate) => <option key={field(candidate, "id")} value={field(candidate, "name")} />)}</datalist>
          </Field>
          <Field label="Candidate record">
            <select className={controlClass} name="candidate_id" defaultValue="">
              <option value="">Not linked</option>
              {opportunity.candidates.map((candidate) => <option key={field(candidate, "id")} value={field(candidate, "id")}>{field(candidate, "name")}</option>)}
            </select>
          </Field>
          <Field label="Client"><input className={controlClass} name="client_name" defaultValue={opportunity.contactName} /></Field>
          <Field label="Interview date"><input className={controlClass} type="datetime-local" name="interview_at" /></Field>
          <Field label="Status"><select className={controlClass} name="status">{INTERVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>
          <Field label="Next action"><input className={controlClass} name="next_action" /></Field>
          <Field label="Client feedback"><textarea className={textareaClass} name="client_feedback" /></Field>
          <Field label="Notes"><textarea className={textareaClass} name="notes" /></Field>
          <div className="md:col-span-2"><SubmitButton>Save interview</SubmitButton></div>
        </ActionForm>
      </SectionCard>
      <SectionCard title="Interview history">
        <ul className="space-y-3 text-sm">
          {opportunity.interviews.map((interview) => (
            <li key={field(interview, "id")} className="border-b border-border pb-3">
              <p className="font-medium">{field(interview, "candidate_name")} · {field(interview, "status")}</p>
              <p className="text-muted-foreground">{formatDateTime(field(interview, "interview_at"))} · {field(interview, "client_name")}</p>
              {field(interview, "client_feedback") ? <p className="mt-1">{field(interview, "client_feedback")}</p> : null}
              {field(interview, "next_action") ? <p className="mt-1">Next: {field(interview, "next_action")}</p> : null}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function Sow({ opportunity }: { opportunity: OpportunityRecord }) {
  const contract = opportunity.contract;
  const client = opportunity.client;
  const mrr = client ? Number(field(client, "monthly_recurring_revenue")) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="SOW / contract">
        <ActionForm action={saveContract} className="grid gap-3">
          <input type="hidden" name="opportunity_id" value={opportunity.id} />
          <Field label="Status"><select className={controlClass} name="status" defaultValue={field(contract, "status") || "Preparing"}>{CONTRACT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>
          <Field label="Candidate selected"><input className={controlClass} type="date" name="candidate_selected_on" defaultValue={field(contract, "candidate_selected_on").slice(0, 10)} /></Field>
          <Field label="SOW preparation"><input className={controlClass} type="date" name="sow_preparation_on" defaultValue={field(contract, "sow_preparation_on").slice(0, 10)} /></Field>
          <Field label="SOW sent"><input className={controlClass} type="date" name="sow_sent_on" defaultValue={field(contract, "sow_sent_on").slice(0, 10)} /></Field>
          <Field label="Negotiation status"><input className={controlClass} name="negotiation_status" defaultValue={field(contract, "negotiation_status")} /></Field>
          <Field label="SOW signed"><input className={controlClass} type="date" name="sow_signed_on" defaultValue={field(contract, "sow_signed_on").slice(0, 10)} /></Field>
          <Field label="Expected start"><input className={controlClass} type="date" name="expected_start_on" defaultValue={field(contract, "expected_start_on").slice(0, 10)} /></Field>
          <Field label="Headcount"><input className={controlClass} name="headcount" defaultValue={field(contract, "headcount") || opportunity.headcount || ""} /></Field>
          <Field label="Billing rate"><input className={controlClass} name="billing_rate" defaultValue={field(contract, "billing_rate") || opportunity.billingRate || ""} /></Field>
          <Field label="Notes"><textarea className={textareaClass} name="notes" defaultValue={field(contract, "notes")} /></Field>
          <SubmitButton>Save SOW</SubmitButton>
        </ActionForm>
      </SectionCard>
      <SectionCard title="Client start" description="Moves the opportunity to Client Started and records closed MRR and ARR.">
        {client ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Start</dt><dd>{formatDate(field(client, "start_date"))}</dd></div>
            <div><dt className="text-xs text-muted-foreground">VAs</dt><dd>{field(client, "number_of_vas")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">MRR</dt><dd>{formatMoney(mrr)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ARR</dt><dd>{formatMoney(Number(field(client, "annual_recurring_revenue")))}</dd></div>
          </dl>
        ) : (
          <ActionForm action={startClient} className="grid gap-3">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <Field label="Start date"><input className={controlClass} type="date" name="start_date" required /></Field>
            <Field label="Number of VAs"><input className={controlClass} name="number_of_vas" defaultValue={opportunity.headcount ?? ""} required /></Field>
            <Field label="Billing rate"><input className={controlClass} name="billing_rate" defaultValue={opportunity.billingRate ?? ""} required /></Field>
            <Field label="Note"><input className={controlClass} name="note" /></Field>
            <SubmitButton>Mark client started</SubmitButton>
          </ActionForm>
        )}
      </SectionCard>
    </div>
  );
}

function FollowUps({ opportunity }: { opportunity: OpportunityRecord }) {
  return (
    <SectionCard title="Follow-ups">
      <ActionForm action={createFollowUp} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="opportunity_id" value={opportunity.id} />
        <input type="hidden" name="lead_id" value={opportunity.leadId} />
        <Field label="Next action"><input className={controlClass} name="title" required /></Field>
        <Field label="Due date"><input className={controlClass} type="date" name="due_on" required /></Field>
        <Field label="Reason"><input className={controlClass} name="reason" list="nurture-follow" /></Field>
        <datalist id="nurture-follow">{NURTURE_REASON_SUGGESTIONS.map((reason) => <option key={reason} value={reason} />)}</datalist>
        <Field label="Notes"><textarea className={textareaClass} name="notes" /></Field>
        <div className="md:col-span-2"><SubmitButton>Create follow-up</SubmitButton></div>
      </ActionForm>
      <ul className="mt-4 divide-y divide-border text-sm">
        {opportunity.followUps.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-3">
            <span>{item.title}<p className="text-xs text-muted-foreground">{formatDate(item.dueOn)} · {item.status}{item.reason ? ` · ${item.reason}` : ""}</p></span>
            {item.status === "open" ? (
              <form action={completeFollowUp}>
                <input type="hidden" name="follow_up_id" value={item.id} />
                <input type="hidden" name="opportunity_id" value={opportunity.id} />
                <SubmitButton variant="outline">Complete</SubmitButton>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function Notes({ opportunity }: { opportunity: OpportunityRecord }) {
  return (
    <SectionCard title="Internal notes" description="New notes are added. Older notes stay as written.">
      <ActionForm action={addNote} className="space-y-3">
        <input type="hidden" name="opportunity_id" value={opportunity.id} />
        <textarea className={textareaClass} name="body" required />
        <SubmitButton>Add note</SubmitButton>
      </ActionForm>
      <ul className="mt-4 space-y-3 text-sm">
        {opportunity.notes.map((note) => <li key={note.id}><p>{note.body}</p><p className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p></li>)}
      </ul>
    </SectionCard>
  );
}

function Documents({ opportunity }: { opportunity: OpportunityRecord }) {
  return (
    <SectionCard title="Documents">
      <ActionForm action={uploadDocument} className="space-y-3">
        <input type="hidden" name="opportunity_id" value={opportunity.id} />
        <input name="file" type="file" required className="text-sm" />
        <SubmitButton>Upload</SubmitButton>
      </ActionForm>
      <ul className="mt-4 space-y-2 text-sm">
        {opportunity.documents.map((document) => (
          <li key={document.id}>
            {document.url ? <a className="text-primary underline" href={document.url}>{document.name}</a> : document.name}
            <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(document.createdAt)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
