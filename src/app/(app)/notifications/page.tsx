import { PageHeader, SectionCard } from "@/components/bits";
import { AttentionFilters, AttentionQueueList } from "@/components/attention-queue";
import { filterAttentionQueue, isAttentionView } from "@/lib/attention-queue";
import { getCommandCenter } from "@/lib/data";
import { firstParam } from "@/lib/format";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const query = await searchParams;
  const [center, session] = await Promise.all([getCommandCenter(), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
  const requested = firstParam(query.view);
  const view = isAttentionView(requested) ? requested : "open";
  const items = filterAttentionQueue(center.queue, view);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Action queue"
        title="Attention"
        description="One list of work to do. Completing a reminder here updates the calendar, profiles, and Command Center counts."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{center.queueCounts.open}</span> open
        </p>
        <AttentionFilters active={view} counts={center.queueCounts} />
      </div>
      <SectionCard title={view === "open" ? "Open work" : view === "completed" ? "Recently completed" : view === "overdue" ? "Overdue" : view === "today" ? "Due today" : "Upcoming"}>
        <AttentionQueueList
          items={items}
          canWrite={canWrite}
          empty={view === "completed" ? "Nothing completed recently." : "Nothing in this queue."}
        />
      </SectionCard>
    </div>
  );
}
