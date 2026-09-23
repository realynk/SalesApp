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
import { RISK_LEVELS, WAITING_ON, type OpportunityStage } from "@/lib/domain";
import { formatDate, formatMoney } from "@/lib/format";
import { dropOpportunityOnStage } from "@/server/actions";

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
  stage: OpportunityStage;
  companyName: string;
  contactName: string;
  nextAction: string | null;
  nextActionDate: string | null;
  ownerName: string | null;
  mrr: number | null;
  waitingOn: string;
  riskLevel: string;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

export function PipelineBoard({
  stages,
  opportunities,
}: {
  stages: readonly OpportunityStage[];
  opportunities: BoardOpportunity[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(opportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

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
        .filter((column) => column.items.length > 0 || (activeId != null && column.acceptsDrop)),
    [activeId, items, stages],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? opportunities.find((item) => item.id === activeId);

  if (opportunities.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">No opportunities match these filters.</p>;
  }

  async function persistMove(opportunity: BoardOpportunity, stage: OpportunityStage, previous: BoardOpportunity[]) {
    const formData = new FormData();
    formData.set("opportunity_id", opportunity.id);
    formData.set("stage", stage);
    formData.set("next_action", opportunity.nextAction ?? "Review this opportunity");
    formData.set("next_action_date", opportunity.nextActionDate ?? new Date().toISOString().slice(0, 10));
    formData.set("waiting_on", (WAITING_ON as readonly string[]).includes(opportunity.waitingOn) ? opportunity.waitingOn : "internal");
    formData.set("risk_level", (RISK_LEVELS as readonly string[]).includes(opportunity.riskLevel) ? opportunity.riskLevel : "low");
    formData.set("note", `Moved on the board to ${stage}`);
    setPendingId(opportunity.id);
    const result = await dropOpportunityOnStage(formData);
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

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const opportunity = items.find((item) => item.id === event.active.id);
    const stage = event.over?.id ? String(event.over.id) as OpportunityStage : null;
    if (!opportunity || !stage || opportunity.stage === stage) return;
    if (BLOCKED_DROPS.has(stage)) {
      setNotice(
        stage === "Lost"
          ? "Open the opportunity and add a lost reason before moving it to Lost."
          : "Open the opportunity and use Client start so the start date, headcount, and rate are recorded.",
      );
      return;
    }
    const previous = items;
    setItems(previous.map((item) => (item.id === opportunity.id ? { ...item, stage } : item)));
    void persistMove(opportunity, stage, previous);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Drag a card onto a stage. History is kept. Lost and Client Started still need their extra fields on the opportunity page.</p>
      {notice ? <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{notice}</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
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
          {activeItem ? <OpportunityCard opportunity={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>
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
  items: BoardOpportunity[];
  acceptsDrop: boolean;
  disabledId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    disabled: !acceptsDrop,
    data: { stage },
  });
  const value = items.reduce((sum, item) => sum + (item.mrr ?? 0), 0);

  return (
    <section
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl border border-t-4 bg-muted/40 ${tone} ${
        isOver ? "border-primary bg-accent/80" : "border-border"
      }`}
    >
      <header className="px-3 py-3">
        <h2 className="text-sm font-bold leading-5">{stage}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "opportunity" : "opportunities"}
          {value ? ` · ${formatMoney(value)}` : ""}
        </p>
      </header>
      <ul className="flex min-h-32 flex-col gap-2 px-2 pb-3">
        {items.map((opportunity) => (
          <li key={opportunity.id}>
            <DraggableCard opportunity={opportunity} disabled={disabledId === opportunity.id} />
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

function DraggableCard({ opportunity, disabled }: { opportunity: BoardOpportunity; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    disabled,
    data: { opportunity },
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "opacity-30" : undefined}
      {...listeners}
      {...attributes}
    >
      <OpportunityCard opportunity={opportunity} />
    </div>
  );
}

function OpportunityCard({ opportunity, overlay = false }: { opportunity: BoardOpportunity; overlay?: boolean }) {
  return (
    <article className={`rounded-lg border border-border bg-card p-3 shadow-sm ${overlay ? "rotate-1 cursor-grabbing shadow-lg" : "cursor-grab"}`}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          {overlay ? (
            <CardBody opportunity={opportunity} />
          ) : (
            <Link href={`/opportunities/${opportunity.id}`} className="block">
              <CardBody opportunity={opportunity} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CardBody({ opportunity }: { opportunity: BoardOpportunity }) {
  return (
    <>
      <p className="text-sm font-semibold">{opportunity.companyName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{opportunity.contactName}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <CardField label="Next action" value={opportunity.nextAction ?? "Set the next action"} />
        <CardField label="Due" value={formatDate(opportunity.nextActionDate)} />
        <CardField label="Owner" value={opportunity.ownerName ?? "Unassigned"} />
        <CardField label="Potential MRR" value={formatMoney(opportunity.mrr)} />
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
