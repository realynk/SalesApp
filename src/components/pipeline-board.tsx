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
import { GripVertical } from "lucide-react";
import { RISK_LEVELS, STAGE_PLAYBOOK, PROFILE_SEND_STAGE, BOOKED_CALL_STAGE, WAITING_ON, stageLabel, type OpportunityStage } from "@/lib/domain";
import { formatDate, formatMoney } from "@/lib/format";
import { dropLeadOnStage, dropOpportunityOnStage } from "@/server/actions";
import { BookedCallDialog } from "@/components/booked-call-dialog";
import { ProfileSendDialog, type ProfileSendDraft } from "@/components/profile-send-dialog";

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
  mrr: number | null;
  waitingOn: string;
  riskLevel: string;
  email: string | null;
};

export type BoardLead = {
  id: string;
  companyName: string;
  contactName: string;
  email: string | null;
  nextFollowUp: { title: string; dueOn: string } | null;
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
  mrr: number | null;
  waitingOn: string;
  riskLevel: string;
  email: string | null;
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
    stage: opportunity.stage,
    companyName: opportunity.companyName,
    contactName: opportunity.contactName,
    nextAction: opportunity.nextAction,
    nextActionDate: opportunity.nextActionDate,
    ownerName: opportunity.ownerName,
    mrr: opportunity.mrr,
    waitingOn: opportunity.waitingOn,
    riskLevel: opportunity.riskLevel,
    email: opportunity.email,
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
    mrr: null,
    waitingOn: "internal",
    riskLevel: "low",
    email: lead.email,
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

  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ kind: "profile-send" | "booked-call"; item: BoardItem; previous: BoardItem[] } | null>(null);

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
          acceptsDrop: !BLOCKED_DROPS.has(stage),
        }))
        .filter((column) => column.items.length > 0 || column.acceptsDrop),
    [items, stages],
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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setNotice(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const item = items.find((entry) => entry.id === event.active.id);
    const stage = event.over?.id ? String(event.over.id) as OpportunityStage : null;
    if (!item || !stage || item.stage === stage) return;
    if (BLOCKED_DROPS.has(stage)) {
      setNotice(
        stage === "Lost"
          ? "Open the opportunity and add a lost reason before moving it to Lost."
          : "Open the opportunity and use Client start so the start date, headcount, and rate are recorded.",
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
    void persistMove(item, stage, previous);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The Interested column is every lead tagged Interested in SendPilot who has not moved further. Drag a card onto a later stage to start or continue the journey.
      </p>
      {notice ? <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{notice}</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-start gap-3">
            {columns.map((column) => (
              <BoardColumn
                key={column.stage}
                stage={column.stage}
                tone={column.tone}
                items={column.items}
                acceptsDrop={column.acceptsDrop}
                disabledId={pendingId}
              />
            ))}
          </div>
        </div>
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
}: {
  stage: OpportunityStage;
  tone: string;
  items: BoardItem[];
  acceptsDrop: boolean;
  disabledId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    disabled: !acceptsDrop,
    data: { stage },
  });
  const value = items.reduce((sum, item) => sum + (item.mrr ?? 0), 0);
  const sendpilotIntake = stage === "Interested";

  return (
    <section
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl border border-t-4 bg-muted/40 ${tone} ${
        isOver ? "border-primary bg-accent/80" : "border-border"
      }`}
    >
      <header className="px-3 py-3">
        <h2 className="text-sm font-bold leading-5">{stageLabel(stage)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {sendpilotIntake ? "From SendPilot" : null}
          {sendpilotIntake ? " · " : null}
          {items.length} {sendpilotIntake ? (items.length === 1 ? "lead" : "leads") : items.length === 1 ? "opportunity" : "opportunities"}
          {value ? ` · ${formatMoney(value)}` : ""}
        </p>
      </header>
      <ul className="flex min-h-32 flex-col gap-2 px-2 pb-3">
        {items.map((item) => (
          <li key={item.id}>
            <DraggableCard item={item} disabled={disabledId === item.id} />
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {acceptsDrop ? "Drop a card here" : "Open the opportunity to use this stage"}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DraggableCard({ item, disabled }: { item: BoardItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled,
    data: { item },
  });

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : undefined} {...listeners} {...attributes}>
      <ItemCard item={item} />
    </div>
  );
}

function ItemCard({ item, overlay = false }: { item: BoardItem; overlay?: boolean }) {
  return (
    <article className={`rounded-lg border border-border bg-card p-3 shadow-sm ${overlay ? "rotate-1 cursor-grabbing shadow-lg" : "cursor-grab"}`}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          {overlay ? (
            <CardBody item={item} />
          ) : (
            <Link href={item.href} className="block">
              <CardBody item={item} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CardBody({ item }: { item: BoardItem }) {
  return (
    <>
      <p className="text-sm font-semibold">{item.companyName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.contactName}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <CardField label={item.kind === "lead" ? "Follow-up" : "Next action"} value={item.nextAction ?? "Set the next action"} />
        <CardField label="Due" value={formatDate(item.nextActionDate)} />
        {item.kind === "opportunity" ? <CardField label="Owner" value={item.ownerName ?? "Unassigned"} /> : <CardField label="Source" value="SendPilot Interested" />}
        {item.kind === "opportunity" ? <CardField label="Potential MRR" value={formatMoney(item.mrr)} /> : null}
      </dl>
    </>
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
