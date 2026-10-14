import Link from "next/link";
import { completeFollowUp, reopenFollowUp } from "@/server/actions";
import { SubmitButton } from "@/components/forms";
import { formatDate } from "@/lib/format";
import type { AttentionQueueItem, AttentionView } from "@/lib/attention-queue";

const FILTERS: Array<{ view: AttentionView | "open"; label: string }> = [
  { view: "open", label: "Open" },
  { view: "overdue", label: "Overdue" },
  { view: "today", label: "Due today" },
  { view: "upcoming", label: "Upcoming" },
  { view: "completed", label: "Completed" },
];

export function AttentionFilters({
  active,
  counts,
}: {
  active: AttentionView | "open";
  counts: { open: number; overdue: number; today: number; upcoming: number; completed: number };
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => {
        const href = filter.view === "open" ? "/notifications" : `/notifications?view=${filter.view}`;
        const selected = active === filter.view;
        const count = counts[filter.view];
        return (
          <Link
            key={filter.view}
            href={href}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {filter.label}
            <span className="ml-1 tabular-nums">{count}</span>
          </Link>
        );
      })}
    </div>
  );
}

function PriorityMark({ priority }: { priority: AttentionQueueItem["priority"] }) {
  if (priority === "overdue") return <span className="text-[11px] font-medium uppercase text-destructive">Overdue</span>;
  if (priority === "today") return <span className="text-[11px] font-medium uppercase text-primary">Today</span>;
  if (priority === "done") return <span className="text-[11px] font-medium uppercase text-muted-foreground">Done</span>;
  return <span className="text-[11px] font-medium uppercase text-muted-foreground">Upcoming</span>;
}

export function AttentionQueueList({
  items,
  canWrite,
  empty,
}: {
  items: AttentionQueueItem[];
  canWrite: boolean;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              <PriorityMark priority={item.priority} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.subjectLabel}
              {item.dueOn ? ` · ${item.view === "completed" ? "Due" : "Due"} ${formatDate(item.dueOn)}` : ""}
              {item.completedAt ? ` · Completed ${formatDate(item.completedAt.slice(0, 10))}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={item.href} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent">
              Open profile
            </Link>
            {canWrite && item.action === "complete" && item.followUpId ? (
              <form action={completeFollowUp}>
                <input type="hidden" name="follow_up_id" value={item.followUpId} />
                {item.opportunityId ? <input type="hidden" name="opportunity_id" value={item.opportunityId} /> : null}
                {item.leadId ? <input type="hidden" name="lead_id" value={item.leadId} /> : null}
                <SubmitButton variant="outline">Mark Done</SubmitButton>
              </form>
            ) : null}
            {canWrite && item.view === "completed" && item.followUpId ? (
              <form action={reopenFollowUp}>
                <input type="hidden" name="follow_up_id" value={item.followUpId} />
                <SubmitButton variant="outline">Reopen</SubmitButton>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
