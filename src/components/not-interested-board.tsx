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
import { NOT_INTERESTED_OUTCOMES, type NotInterestedOutcome } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { dropLeadOnOutcome } from "@/server/actions";

const COLUMN_TONE = [
  "border-t-[#155eef]",
  "border-t-[#ef6820]",
  "border-t-[#7a5af8]",
  "border-t-[#12b76a]",
  "border-t-[#f97066]",
];

export type NotInterestedCard = {
  id: string;
  companyName: string;
  contactName: string;
  notInterestedOutcome: NotInterestedOutcome;
  nextFollowUp: { title: string; dueOn: string } | null;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

export function NotInterestedBoard({ leads }: { leads: NotInterestedCard[] }) {
  const router = useRouter();
  const [items, setItems] = useState(leads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(
    () =>
      NOT_INTERESTED_OUTCOMES.map((outcome, index) => ({
        outcome,
        tone: COLUMN_TONE[index % COLUMN_TONE.length],
        items: items.filter((item) => item.notInterestedOutcome === outcome),
      })),
    [items],
  );

  if (leads.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">No Not Interested leads yet. Mark a lead as Not Interested to sort it here.</p>;
  }

  const activeItem = items.find((item) => item.id === activeId) ?? leads.find((item) => item.id === activeId);

  async function persistMove(lead: NotInterestedCard, outcome: NotInterestedOutcome, previous: NotInterestedCard[]) {
    const formData = new FormData();
    formData.set("lead_id", lead.id);
    formData.set("not_interested_outcome", outcome);
    setPendingId(lead.id);
    const result = await dropLeadOnOutcome(formData);
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
    const lead = items.find((item) => item.id === event.active.id);
    const outcome = event.over?.id ? String(event.over.id) as NotInterestedOutcome : null;
    if (!lead || !outcome || lead.notInterestedOutcome === outcome) return;
    if (!(NOT_INTERESTED_OUTCOMES as readonly string[]).includes(outcome)) return;
    const previous = items;
    setItems(previous.map((item) => (item.id === lead.id ? { ...item, notInterestedOutcome: outcome } : item)));
    void persistMove(lead, outcome, previous);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Drag a card onto Nurture, No longer in the company, Not the decision maker, Not relevant, or Stop.
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
              <OutcomeColumn key={column.outcome} outcome={column.outcome} tone={column.tone} items={column.items} disabledId={pendingId} />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <LeadCard lead={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function OutcomeColumn({
  outcome,
  tone,
  items,
  disabledId,
}: {
  outcome: NotInterestedOutcome;
  tone: string;
  items: NotInterestedCard[];
  disabledId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: outcome, data: { outcome } });
  return (
    <section
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl border border-t-4 bg-muted/40 ${tone} ${isOver ? "border-primary bg-accent/80" : "border-border"}`}
    >
      <header className="px-3 py-3">
        <h2 className="text-sm font-bold leading-5">{outcome}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "lead" : "leads"}
        </p>
      </header>
      <ul className="flex min-h-32 flex-col gap-2 px-2 pb-3">
        {items.map((lead) => (
          <li key={lead.id}>
            <DraggableLead lead={lead} disabled={disabledId === lead.id} />
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Drop a card here</li>
        ) : null}
      </ul>
    </section>
  );
}

function DraggableLead({ lead, disabled }: { lead: NotInterestedCard; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled, data: { lead } });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : undefined} {...listeners} {...attributes}>
      <LeadCard lead={lead} />
    </div>
  );
}

function LeadCard({ lead, overlay = false }: { lead: NotInterestedCard; overlay?: boolean }) {
  return (
    <article className={`rounded-lg border border-border bg-card p-3 shadow-sm ${overlay ? "rotate-1 cursor-grabbing shadow-lg" : "cursor-grab"}`}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          {overlay ? (
            <CardBody lead={lead} />
          ) : (
            <Link href={`/leads/${lead.id}`} className="block">
              <CardBody lead={lead} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CardBody({ lead }: { lead: NotInterestedCard }) {
  return (
    <>
      <p className="text-sm font-semibold">{lead.companyName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{lead.contactName}</p>
      <p className="mt-2 text-xs">{lead.nextFollowUp ? lead.nextFollowUp.title : "No follow-up scheduled"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lead.nextFollowUp ? `Due ${formatDate(lead.nextFollowUp.dueOn)}` : "Open the lead to set a reminder"}</p>
    </>
  );
}
