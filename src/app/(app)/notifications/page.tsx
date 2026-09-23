import { AttentionList, PageHeader, SectionCard } from "@/components/bits";
import { getCommandCenter } from "@/lib/data";

const GROUPS = [
  ["needs", "Needs attention"],
  ["today", "Due today"],
  ["upcoming", "Coming up"],
  ["waiting_client", "Waiting on client"],
  ["waiting_recruitment", "Waiting on recruitment"],
  ["stale", "Stale"],
  ["at_risk", "At risk"],
] as const;

export default async function NotificationsPage() {
  const center = await getCommandCenter();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="In-app" title="Attention" description="These are calculated from the live pipeline. Email delivery is not turned on." />
      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map(([key, label]) => (
          <SectionCard key={key} title={label}>
            <AttentionList items={center.attention.filter((item) => item.sections.includes(key))} empty="Nothing in this queue." />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
