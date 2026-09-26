import Link from "next/link";
import { PageHeader } from "@/components/bits";
import { listRecruitment } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function RecruitmentPage() {
  const requests = await listRecruitment();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Handoff" title="Recruitment requests" description="Each request inherits the strategy call. Targets default to the business-day window in Settings unless an urgent date was set." />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr><th className="px-4 py-3">Company</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Headcount</th></tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-border">
                <td className="px-4 py-3"><Link className="font-medium" href={`/recruitment/${request.id}`}>{request.companyName}</Link>{request.urgent ? <span className="ml-2 text-xs text-destructive">Urgent</span> : null}</td>
                <td className="px-4 py-3">{request.status}</td>
                <td className="px-4 py-3">{formatDate(request.targetOn)}</td>
                <td className="px-4 py-3">{request.headcount ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No recruitment requests yet. Send one from an opportunity after requirements are captured.</p> : null}
      </div>
    </div>
  );
}
