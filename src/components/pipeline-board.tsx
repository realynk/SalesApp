"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Flag, GripVertical } from "lucide-react";
import { RISK_LEVELS, STAGE_PLAYBOOK, PROFILE_SEND_STAGE, BOOKED_CALL_STAGE, SALES_CALL_COMPLETE_STAGE, WAITING_ON, accountFlagIconClass, accountFlagLabel, boardStage, isHiddenBoardStage, stageLabel, type AccountFlag, type OpportunityStage } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { dropLeadOnStage, dropOpportunityOnStage, setAccountFlagFromBoard } from "@/server/actions";
import { AccountFlagButton } from "@/components/account-flag-field";
import { sendPilotSourceIndicator, type SendPilotLeadSource } from "@/lib/sendpilot/lead-sources";
import { BookedCallDialog } from "@/components/booked-call-dialog";
import { ProfileSendDialog, type ProfileSendDraft } from "@/components/profile-send-dialog";
import { SalesCallCompleteDialog } from "@/components/sales-call-complete-dialog";
import { BoardScroller } from "@/components/board-scroller";
import { useCanWriteCrm } from "@/components/workspace-access";

const COLUMN_TONE = [
  "border-t-[#f97066]",
  "border-t-[#7a5af8]",
  "border-t-[#12b76a]",
  "border-t-[#3538cd]",
  "border-t-[#ef6820]",
  "border-t-[#155eef]",
];

const BLOCKED_DROPS = new Set<OpportunityStage>(["Lost", "Client Started"]);

export type BoardOpportunity = {
  id: string;
  leadId: string;
  stage: OpportunityStage;
  companyName: string;
  contactName: string;
  nextAction: string | null;
  nextActionDate: string | null;
  ownerName: string | null;
  waitingOn: string;
  riskLevel: string;
  email: string | null;
  accountFlag: AccountFlag | null;
  sendpilotSources?: SendPilotLeadSource[];
};

export type BoardLead = {
  id: string;
  companyName: string;
  contactName: string;
  email: string | null;
  nextFollowUp: { title: string; dueOn: string } | null;
  accountFlag: AccountFlag | null;
  sendpilotSources?: SendPilotLeadSource[];
};

type BoardItem = {
  id: string;
  kind: "lead" | "opportunity";
  leadId: string;
  opportunityId: string | null;
  stage: OpportunityStage;
  companyName: string;
  contactName: string;
  nextAction: string | null;
  nextActionDate: string | null;
  ownerName: string | null;
  waitingOn: string;
  riskLevel: string;
  email: string | null;
  accountFlag: AccountFlag | null;
  sendpilotSources: SendPilotLeadSource[];
  href: string;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

function fromOpportunity(opportunity: BoardOpportunity): BoardItem {
  return {
    id: `opp:${opportunity.id}`,
    kind: "opportunity",
    leadId: opportunity.leadId,
    opportunityId: opportunity.id,
    stage: boardStage(opportunity.stage),
    companyName: opportunity.companyName,
    contactName: opportunity.contactName,
    nextAction: opportunity.nextAction,
    nextActionDate: opportunity.nextActionDate,
    ownerName: opportunity.ownerName,
    waitingOn: opportunity.waitingOn,
    riskLevel: opportunity.riskLevel,
    email: opportunity.email,
    accountFlag: opportunity.accountFlag,
    sendpilotSources: opportunity.sendpilotSources ?? [],
    href: `/opportunities/${opportunity.id}`,
  };
}

function fromLead(lead: BoardLead, opportunity?: BoardOpportunity): BoardItem {
  if (opportunity) return fromOpportunity({ ...opportunity, stage: "Interested" });
  return {
    id: `lead:${lead.id}`,
    kind: "lead",
    leadId: lead.id,
    opportunityId: null,
    stage: "Interested",
    companyName: lead.companyName,
    contactName: lead.contactName,
    nextAction: lead.nextFollowUp?.title ?? "Drag onto a stage to start the client journey",
    nextActionDate: lead.nextFollowUp?.dueOn ?? null,
    ownerName: null,
    waitingOn: "internal",
    riskLevel: "low",
    email: lead.email,
    accountFlag: lead.accountFlag,
    sendpilotSources: lead.sendpilotSources ?? [],
    href: `/leads/${lead.id}`,
  };
}

export function PipelineBoard({
  stages,
  opportunities,
  interestedLeads,
}: {
  stages: readonly OpportunityStage[];
  opportunities: BoardOpportunity[];
  interestedLeads: BoardLead[];
}) {
  const laterLeadIds = new Set(opportunities.filter((item) => item.stage !== "Interested").map((item) => item.leadId));
  const intakeLeads = interestedLeads.filter((lead) => !laterLeadIds.has(lead.id));
  const opportunityByLead = new Map(opportunities.filter((item) => item.stage === "Interested").map((item) => [item.leadId, item]));
  const intakeIds = new Set(intakeLeads.map((lead) => lead.id));
  const initialItems = [
    ...intakeLeads.map((lead) => fromLead(lead, opportunityByLead.get(lead.id))),
    ...opportunities.filter((item) => item.stage === "Interested" && !intakeIds.has(item.leadId)).map(fromOpportunity),
    ...opportunities.filter((item) => item.stage !== "Interested").map(fromOpportunity),
  ];

  const canWrite = useCanWriteCrm();
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ kind: "profile-send" | "booked-call" | "sales-call-complete"; item: BoardItem; previous: BoardItem[] } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(
    () =>
      stages
        .map((stage, index) => ({
          stage,
          tone: COLUMN_TONE[index % COLUMN_TONE.length],
          items: items.filter((item) => item.stage === stage),
          acceptsDrop: canWrite && !BLOCKED_DROPS.has(stage),
        }))
        .filter((column) => !isHiddenBoardStage(column.stage))
        .filter((column) => column.items.length > 0 || column.acceptsDrop),
    [items, stages, canWrite],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? initialItems.find((item) => item.id === activeId);

  if (initialItems.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">No SendPilot Interested leads or later-stage opportunities match these filters.</p>;
  }

  async function persistMove(item: BoardItem, stage: OpportunityStage, previous: BoardItem[]) {
    const formData = new FormData();
    formData.set("stage", stage);
    formData.set("next_action", item.nextAction && item.kind === "opportunity" ? item.nextAction : STAGE_PLAYBOOK[stage].nextAction);
    formData.set("next_action_date", item.nextActionDate ?? new Date().toISOString().slice(0, 10));
    formData.set("waiting_on", (WAITING_ON as readonly string[]).includes(item.waitingOn) ? item.waitingOn : STAGE_PLAYBOOK[stage].waitingOn);
    formData.set("risk_level", (RISK_LEVELS as readonly string[]).includes(item.riskLevel) ? item.riskLevel : "low");
    if (item.kind === "opportunity" && item.opportunityId) {
      formData.set("opportunity_id", item.opportunityId);
      formData.set("note", `Moved on the board to ${stage}`);
    } else {
      formData.set("lead_id", item.leadId);
    }
    setPendingId(item.id);
    const result = item.kind === "opportunity" ? await dropOpportunityOnStage(formData) : await dropLeadOnStage(formData);
    setPendingId(null);
    if (result?.error) {
      setItems(previous);
      setNotice(result.error);
      return;
    }
    setNotice(null);
    router.refresh();
  }

  async function persistFlag(item: BoardItem, flag: AccountFlag | null) {
    const previous = items;
    setItems(previous.map((entry) => (entry.id === item.id ? { ...entry, accountFlag: flag } : entry)));
    const formData = new FormData();
    formData.set("lead_id", item.leadId);
    if (item.opportunityId) formData.set("opportunity_id", item.opportunityId);
    formData.set("account_flag", flag ?? "");
    const result = await setAccountFlagFromBoard(formData);
    if (result?.error) {
      setItems(previous);
      setNotice(result.error);
      return;
    }
    setNotice(null);
  }

  function handleDragStart(event: DragStartEvent) {
    if (!canWrite) return;
    setActiveId(String(event.active.id));
    setNotice(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canWrite) return;
    setActiveId(null);
    const item = items.find((entry) => entry.id === event.active.id);
    const stage = event.over?.id ? String(event.over.id) as OpportunityStage : null;
    if (!item || !stage || item.stage === stage) return;
    if (isHiddenBoardStage(stage)) return;
    if (BLOCKED_DROPS.has(stage)) {
      setNotice(
        stage === "Lost"
          ? "Open the opportunity and add a lost reason before moving it to Lost."
          : "Open the opportunity and use Client start so the start date and headcount are recorded.",
      );
      return;
    }
    const previous = items;
    setItems(previous.map((entry) => (entry.id === item.id ? { ...entry, stage } : entry)));
    if (stage === PROFILE_SEND_STAGE) {
      setPrompt({ kind: "profile-send", item, previous });
      return;
    }
    if (stage === BOOKED_CALL_STAGE) {
      setPrompt({ kind: "booked-call", item, previous });
      return;
    }
    if (stage === SALES_CALL_COMPLETE_STAGE) {
      setPrompt({ kind: "sales-call-complete", item, previous });
      return;
    }
    void persistMove(item, stage, previous);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {canWrite
          ? "The Interested column is every lead tagged Interested in SendPilot who has not moved further. Drag a card to a later stage. Flag the account if you need to spot it quickly."
          : "The Interested column is every lead tagged Interested in SendPilot who has not moved further. Open a card to review it. This account is view-only."}
      </p>
      {notice ? <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{notice}</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <BoardScroller>
          {columns.map((column) => (
            <BoardColumn
              key={column.stage}
              stage={column.stage}
              tone={column.tone}
              items={column.items}
              acceptsDrop={column.acceptsDrop}
              disabledId={pendingId}
              canDrag={canWrite}
              onFlagChange={canWrite ? persistFlag : undefined}
            />
          ))}
        </BoardScroller>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <ItemCard item={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>
      <ProfileSendDialog
        key={prompt?.kind === "profile-send" ? prompt.item.id : "profile-send"}
        draft={prompt?.kind === "profile-send" ? {
          leadId: prompt.item.leadId,
          opportunityId: prompt.item.opportunityId,
          companyName: prompt.item.companyName,
          contactName: prompt.item.contactName,
          email: prompt.item.email,
          accountFlag: prompt.item.accountFlag,
        } satisfies ProfileSendDraft : null}
        onCancel={() => {
          if (prompt) setItems(prompt.previous);
          setPrompt(null);
        }}
        onSaved={() => {
          setPrompt(null);
          router.refresh();
        }}
      />
      <BookedCallDialog
        key={prompt?.kind === "booked-call" ? prompt.item.id : "booked-call"}
        draft={prompt?.kind === "booked-call" ? {
          leadId: prompt.item.leadId,
          opportunityId: prompt.item.opportunityId,
          companyName: prompt.item.companyName,
          contactName: prompt.item.contactName,
          accountFlag: prompt.item.accountFlag,
        } : null}
        onCancel={() => {
          if (prompt) setItems(prompt.previous);
          setPrompt(null);
        }}
        onSaved={() => {
          setPrompt(null);
          router.refresh();
        }}
      />
      <SalesCallCompleteDialog
        key={prompt?.kind === "sales-call-complete" ? prompt.item.id : "sales-call-complete"}
        draft={prompt?.kind === "sales-call-complete" ? {
          leadId: prompt.item.leadId,
          opportunityId: prompt.item.opportunityId,
          companyName: prompt.item.companyName,
          contactName: prompt.item.contactName,
          accountFlag: prompt.item.accountFlag,
        } : null}
        onCancel={() => {
          if (prompt) setItems(prompt.previous);
          setPrompt(null);
        }}
        onSaved={() => {
          setPrompt(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function BoardColumn({
  stage,
  tone,
  items,
  acceptsDrop,
  disabledId,
  canDrag,
  onFlagChange,
}: {
  stage: OpportunityStage;
  tone: string;
  items: BoardItem[];
  acceptsDrop: boolean;
  disabledId: string | null;
  canDrag: boolean;
  onFlagChange?: (item: BoardItem, flag: AccountFlag | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    disabled: !acceptsDrop,
    data: { stage },
  });
  const sendpilotIntake = stage === "Interested";

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-t-4 bg-muted/40 ${tone} ${
        isOver ? "border-primary bg-accent/80" : "border-border"
      }`}
    >
      <header className={`sticky top-0 z-10 shrink-0 px-3 py-3 ${isOver ? "bg-accent/80" : "bg-muted/40"}`}>
        <h2 className="text-sm font-bold leading-5">{stageLabel(stage)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {sendpilotIntake ? "From SendPilot" : null}
          {sendpilotIntake ? " · " : null}
          {items.length} {sendpilotIntake ? (items.length === 1 ? "lead" : "leads") : items.length === 1 ? "opportunity" : "opportunities"}
        </p>
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {items.map((item) => (
          <li key={item.id}>
            <DraggableCard item={item} disabled={!canDrag || disabledId === item.id} canDrag={canDrag} onFlagChange={onFlagChange} />
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {canDrag && acceptsDrop ? "Drop a card here" : items.length === 0 ? "No cards in this stage" : "Open the opportunity to use this stage"}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DraggableCard({
  item,
  disabled,
  canDrag,
  onFlagChange,
}: {
  item: BoardItem;
  disabled: boolean;
  canDrag: boolean;
  onFlagChange?: (item: BoardItem, flag: AccountFlag | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled,
    data: { item },
  });

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : undefined} {...listeners} {...attributes}>
      <ItemCard item={item} canDrag={canDrag} onFlagChange={onFlagChange} />
    </div>
  );
}

function ItemCard({
  item,
  overlay = false,
  canDrag = true,
  onFlagChange,
}: {
  item: BoardItem;
  overlay?: boolean;
  canDrag?: boolean;
  onFlagChange?: (item: BoardItem, flag: AccountFlag | null) => void;
}) {
  return (
    <article className={`rounded-lg border border-border bg-card p-3 shadow-sm ${overlay ? "rotate-1 cursor-grabbing shadow-lg" : canDrag ? "cursor-grab" : ""}`}>
      <div className="flex items-start gap-2">
        {canDrag ? <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            {overlay ? (
              <div className="min-w-0 flex-1">
                <CardHeading item={item} />
              </div>
            ) : (
              <Link href={item.href} className="min-w-0 flex-1">
                <CardHeading item={item} />
              </Link>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <SendPilotSourceBadge sources={item.sendpilotSources} />
              {overlay || !onFlagChange ? (
                <span className="inline-flex size-6 items-center justify-center" title={accountFlagLabel(item.accountFlag)}>
                  <Flag className={`size-3.5 ${accountFlagIconClass(item.accountFlag)}`} aria-hidden />
                </span>
              ) : (
                <AccountFlagButton value={item.accountFlag} onChange={(flag) => onFlagChange(item, flag)} />
              )}
            </div>
          </div>
          {overlay ? (
            <CardMeta item={item} />
          ) : (
            <Link href={item.href} className="block">
              <CardMeta item={item} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CardHeading({ item }: { item: BoardItem }) {
  return (
    <>
      <p className="text-sm font-semibold">{item.contactName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.companyName}</p>
    </>
  );
}

function CardMeta({ item }: { item: BoardItem }) {
  return (
    <dl className="mt-2 space-y-1 text-xs">
      <CardField label={item.kind === "lead" ? "Follow-up" : "Next action"} value={item.nextAction ?? "Set the next action"} />
      {item.nextActionDate ? <CardField label="Due" value={formatDate(item.nextActionDate)} /> : null}
    </dl>
  );
}

function SendPilotSourceBadge({ sources }: { sources: SendPilotLeadSource[] }) {
  const indicator = sendPilotSourceIndicator(sources);
  if (!indicator.show) return null;
  return (
    <span
      title={indicator.title}
      aria-label={indicator.title}
      className="inline-flex h-5 shrink-0 items-center rounded border border-border px-1 text-[10px] font-medium leading-none text-muted-foreground"
    >
      {indicator.label}
    </span>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
