import Link from "next/link";
import { Notice, PageHeader } from "@/components/bits";
import { SubmitButton } from "@/components/forms";
import { listFollowUps } from "@/lib/data";
import { firstParam, formatDate } from "@/lib/format";
import { completeFollowUp } from "@/server/actions";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  const query = await searchParams;
  const items = await listFollowUps(query.status);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nurture" title="Follow-ups" description="A Not Interested lead can still have a future date. When that date arrives, it shows up here and on the command center." />
      <Notice message={firstParam(query.notice)} />
      <div className="flex gap-2 text-sm">
        {["open", "completed", "cancelled", ""].map((status) => (
          <Link key={status || "all"} href={status ? `/follow-ups?status=${status}` : "/follow-ups"} className="rounded-full border border-border px-3 py-1">{status || "All"}</Link>
        ))}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              {item.opportunityId ? <Link className="font-medium" href={`/opportunities/${item.opportunityId}?tab=follow-ups`}>{item.companyName}</Link> : <span className="font-medium">{item.companyName}</span>}
              <p>{item.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(item.dueOn)} · {item.status}{item.reason ? ` · ${item.reason}` : ""}</p>
            </div>
            {item.status === "open" ? (
              <form action={completeFollowUp}>
                <input type="hidden" name="follow_up_id" value={item.id} />
                {item.opportunityId ? <input type="hidden" name="opportunity_id" value={item.opportunityId} /> : null}
                <SubmitButton variant="outline">Complete</SubmitButton>
              </form>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? <li className="py-8 text-sm text-muted-foreground">No follow-ups in this view.</li> : null}
      </ul>
    </div>
  );
}
