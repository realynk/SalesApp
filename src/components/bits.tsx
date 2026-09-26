import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import type { AttentionItem, OpportunityStage, RiskLevel } from "@/lib/domain";
import { stageLabel } from "@/lib/domain";
import { formatDate } from "@/lib/format";

export const controlClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";
export const textareaClass =
  "min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function PageHeader({
  back,
  eyebrow,
  title,
  description,
  actions,
}: {
  back?: { href: string; label: string };
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          {eyebrow ? <p className="text-xs font-medium tracking-[0.14em] text-primary uppercase">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{message}</p>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function stageClass(stage: string) {
  if (stage === "Lost") return "bg-destructive/10 text-destructive";
  if (stage === "Won" || stage === "Client Started") return "bg-success/15 text-success";
  if (stage === "On Hold / Nurture") return "bg-warning/15 text-warning";
  return "bg-primary/10 text-primary";
}

export function StageBadge({ stage }: { stage: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", stageClass(stage))}>{stageLabel(stage)}</span>;
}

export function RiskBadge({ risk }: { risk: RiskLevel | string }) {
  const tone = risk === "critical" || risk === "high" ? "bg-destructive/10 text-destructive" : risk === "medium" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>{risk} risk</span>;
}

export function AttentionList({ items, empty }: { items: AttentionItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className="flex items-start justify-between gap-4 py-3 hover:bg-accent/40">
            <span>
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{item.dueOn ? formatDate(item.dueOn) : ""}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SectionCard({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function DataError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold">Database setup needed</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function journey(stage: OpportunityStage, last: string | null, next: string | null, due: string | null, owner: string | null, risk: string) {
  return [
    ["Stage", stage],
    ["Last activity", last ?? "None recorded"],
    ["Next action", next ?? "Missing"],
    ["Due", due ? formatDate(due) : "Missing"],
    ["Owner", owner ?? "Unassigned"],
    ["Risk", risk],
  ] as const;
}
