import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { addDays, weekStartMonday, type WeekTask } from "@/lib/domain";

function weekHref(week: string, notice?: string, current = false) {
  const params = new URLSearchParams();
  if (!current) params.set("week", week);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  return query ? `/dashboard?${query}#week` : "/dashboard#week";
}

export function WeekCalendar({
  today,
  week,
  tasks,
  notice,
}: {
  today: string;
  week?: string;
  tasks: WeekTask[];
  notice?: string;
}) {
  const requested = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today;
  const start = weekStartMonday(requested);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const end = days[6] ?? start;
  const carried = tasks.filter((task) => task.date < start).sort((a, b) => a.date.localeCompare(b.date));
  const viewingCurrent = start === weekStartMonday(today);

  return (
    <section id="week" className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Week of {format(parseISO(start), "MMM d")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Strategy calls, follow-ups, interviews, recruitment targets, profile check-backs, and SOW dates through {format(parseISO(end), "MMM d")}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={weekHref(addDays(start, -7), notice)}>Previous</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={weekHref(weekStartMonday(today), notice, true)}>This week</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={weekHref(addDays(start, 7), notice)}>Next</Link>
          </Button>
        </div>
      </div>
      {carried.length > 0 ? (
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-destructive uppercase">Still open from earlier</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {carried.slice(0, 8).map((task) => (
              <li key={task.id}>
                <TaskChip task={task} overdue />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 divide-x divide-border">
          {days.map((day) => {
            const items = tasks.filter((task) => task.date === day);
            const isToday = day === today;
            return (
              <div key={day} className={isToday ? "bg-accent/70" : "bg-card"}>
                <div className="border-b border-border px-2 py-2">
                  <p className={`text-xs font-medium uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{format(parseISO(day), "EEE")}</p>
                  <p className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{format(parseISO(day), "d")}</p>
                </div>
                <ul className="flex min-h-40 flex-col gap-2 p-2">
                  {items.length === 0 ? <li className="text-xs text-muted-foreground">Clear</li> : null}
                  {items.map((task) => (
                    <li key={task.id}>
                      <TaskChip task={task} overdue={task.date < today} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {viewingCurrent ? null : (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Showing {format(parseISO(start), "MMM d")}–{format(parseISO(end), "MMM d")}. Today is {format(parseISO(today), "MMM d")}.</p>
      )}
    </section>
  );
}

function TaskChip({ task, overdue }: { task: WeekTask; overdue: boolean }) {
  return (
    <Link href={task.href} className="block rounded-lg border border-border bg-card px-2 py-1.5 hover:border-primary">
      <p className={`text-[11px] font-medium uppercase ${overdue ? "text-destructive" : "text-primary"}`}>{overdue ? `${task.label} · overdue` : task.label}</p>
      <p className="mt-0.5 text-xs font-medium leading-4 text-foreground">{task.title}</p>
      <p className="text-[11px] text-muted-foreground">{task.company}</p>
    </Link>
  );
}
