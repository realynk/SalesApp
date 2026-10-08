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
import {
  NOT_INTERESTED_INTAKE,
  NOT_INTERESTED_OUTCOMES,
  notInterestedColumn,
  type AccountFlag,
  type NotInterestedColumn,
  type NotInterestedOutcome,
} from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { AccountFlagSelect, FlagBadge } from "@/components/account-flag-field";
import { dropLeadOnOutcome, setAccountFlagFromBoard } from "@/server/actions";
import { BoardScroller } from "@/components/board-scroller";
import { useCanWriteCrm } from "@/components/workspace-access";

const COLUMN_TONE = [
  "border-t-[#f97066]",
  "border-t-[#155eef]",
  "border-t-[#ef6820]",
  "border-t-[#7a5af8]",
  "border-t-[#12b76a]",
  "border-t-[#3538cd]",
];

const BOARD_COLUMNS: NotInterestedColumn[] = [NOT_INTERESTED_INTAKE, ...NOT_INTERESTED_OUTCOMES];

export type NotInterestedCard = {
  id: string;
  companyName: string;
  contactName: string;
  notInterestedOutcome: NotInterestedOutcome | null;
  nextFollowUp: { title: string; dueOn: string } | null;
  accountFlag: AccountFlag | null;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

export function NotInterestedBoard({ leads }: { leads: NotInterestedCard[] }) {
  const canWrite = useCanWriteCrm();
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
      BOARD_COLUMNS.map((column, index) => ({
        column,
        tone: COLUMN_TONE[index % COLUMN_TONE.length],
        items: items.filter((item) => notInterestedColumn(item.notInterestedOutcome) === column),
      })),
    [items],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? leads.find((item) => item.id === activeId);

  async function persistMove(lead: NotInterestedCard, column: NotInterestedColumn, previous: NotInterestedCard[]) {
    const formData = new FormData();
    formData.set("lead_id", lead.id);
    formData.set("not_interested_outcome", column);
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
    if (!canWrite) return;
    setActiveId(String(event.active.id));
    setNotice(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canWrite) return;
    setActiveId(null);
    const lead = items.find((item) => item.id === event.active.id);
    const column = event.over?.id ? String(event.over.id) as NotInterestedColumn : null;
    if (!lead || !column || notInterestedColumn(lead.notInterestedOutcome) === column) return;
    if (!BOARD_COLUMNS.includes(column)) return;
    const previous = items;
    setItems(previous.map((item) => (
      item.id === lead.id
        ? { ...item, notInterestedOutcome: column === NOT_INTERESTED_INTAKE ? null : column }
        : item
    )));
    void persistMove(lead, column, previous);
  }

  async function persistFlag(lead: NotInterestedCard, flag: AccountFlag | null) {
    const previous = items;
    setItems(previous.map((item) => (item.id === lead.id ? { ...item, accountFlag: flag } : item)));
    const formData = new FormData();
    formData.set("lead_id", lead.id);
    formData.set("account_flag", flag ?? "");
    const result = await setAccountFlagFromBoard(formData);
    if (result?.error) {
      setItems(previous);
      setNotice(result.error);
      return;
    }
    setNotice(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {canWrite
          ? "The Not Interested column is every lead tagged Not Interested in SendPilot. Drag a card onto Nurture or another reason."
          : "The Not Interested column is every lead tagged Not Interested in SendPilot. Open a card to review it. This account is view-only."}
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
            <OutcomeColumn key={column.column} column={column.column} tone={column.tone} items={column.items} disabledId={pendingId} canDrag={canWrite} onFlagChange={canWrite ? persistFlag : undefined} />
          ))}
        </BoardScroller>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <LeadCard lead={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function OutcomeColumn({
  column,
  tone,
  items,
  disabledId,
  canDrag,
  onFlagChange,
}: {
  column: NotInterestedColumn;
  tone: string;
  items: NotInterestedCard[];
  disabledId: string | null;
  canDrag: boolean;
  onFlagChange?: (lead: NotInterestedCard, flag: AccountFlag | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column, disabled: !canDrag, data: { column } });
  const sendpilotIntake = column === NOT_INTERESTED_INTAKE;
  return (
    <section
      ref={setNodeRef}
      className={`flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-t-4 bg-muted/40 ${tone} ${isOver ? "border-primary bg-accent/80" : "border-border"}`}
    >
      <header className={`sticky top-0 z-10 shrink-0 px-3 py-3 ${isOver ? "bg-accent/80" : "bg-muted/40"}`}>
        <h2 className="text-sm font-bold leading-5">{column}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {sendpilotIntake ? "From SendPilot" : null}
          {sendpilotIntake ? " · " : null}
          {items.length} {items.length === 1 ? "lead" : "leads"}
        </p>
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {items.map((lead) => (
          <li key={lead.id}>
            <DraggableLead lead={lead} disabled={!canDrag || disabledId === lead.id} canDrag={canDrag} onFlagChange={onFlagChange} />
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{canDrag ? "Drop a card here" : "No cards in this column"}</li>
        ) : null}
      </ul>
    </section>
  );
}

function DraggableLead({
  lead,
  disabled,
  canDrag,
  onFlagChange,
}: {
  lead: NotInterestedCard;
  disabled: boolean;
  canDrag: boolean;
  onFlagChange?: (lead: NotInterestedCard, flag: AccountFlag | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled, data: { lead } });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : undefined} {...listeners} {...attributes}>
      <LeadCard lead={lead} canDrag={canDrag} onFlagChange={onFlagChange} />
    </div>
  );
}

function LeadCard({
  lead,
  overlay = false,
  canDrag = true,
  onFlagChange,
}: {
  lead: NotInterestedCard;
  overlay?: boolean;
  canDrag?: boolean;
  onFlagChange?: (lead: NotInterestedCard, flag: AccountFlag | null) => void;
}) {
  return (
    <article className={`rounded-lg border border-border bg-card p-3 shadow-sm ${overlay ? "rotate-1 cursor-grabbing shadow-lg" : canDrag ? "cursor-grab" : ""}`}>
      <div className="flex items-start gap-2">
        {canDrag ? <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          {overlay ? (
            <CardBody lead={lead} />
          ) : (
            <Link href={`/leads/${lead.id}`} className="block">
              <CardBody lead={lead} />
            </Link>
          )}
          {overlay || !onFlagChange ? null : (
            <div className="mt-2">
              <AccountFlagSelect compact value={lead.accountFlag} onChange={(flag) => onFlagChange(lead, flag)} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CardBody({ lead }: { lead: NotInterestedCard }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{lead.contactName}</p>
        <FlagBadge flag={lead.accountFlag} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{lead.companyName}</p>
      <p className="mt-2 text-xs">{lead.nextFollowUp ? lead.nextFollowUp.title : "No follow-up scheduled"}</p>
      {lead.nextFollowUp ? (
        <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(lead.nextFollowUp.dueOn)}</p>
      ) : null}
    </>
  );
}
