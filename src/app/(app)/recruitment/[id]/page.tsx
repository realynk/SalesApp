import Link from "next/link";
import { notFound } from "next/navigation";
import { controlClass, Field, PageHeader } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RECRUITMENT_STATUSES } from "@/lib/domain";
import { getRecruitment } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { updateRecruitmentStatus } from "@/server/actions";

export default async function RecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getRecruitment(id);
  if (!record) notFound();
  const request = record.request;
  const opportunity = request.opportunities as { id?: string } | { id?: string }[] | null;
  const opportunityId = Array.isArray(opportunity) ? opportunity[0]?.id : opportunity?.id;
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/recruitment", label: "Back to recruitment" }}
        eyebrow="Recruitment"
        title={String(request.company_name ?? "Request")}
        description={`Target ${formatDate(String(request.target_on ?? ""))}`}
        actions={opportunityId ? <Link className="text-sm text-primary underline" href={`/opportunities/${opportunityId}?tab=recruitment`}>Opportunity</Link> : null}
      />
      <ActionForm action={updateRecruitmentStatus} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
        <input type="hidden" name="recruitment_id" value={String(request.id)} />
        <input type="hidden" name="opportunity_id" value={opportunityId ?? ""} />
        <Field label="Status">
          <select className={controlClass} name="status" defaultValue={String(request.status)}>
            {RECRUITMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <Field label="Notes"><textarea className="min-h-20 rounded-lg border border-input px-3 py-2 text-sm" name="notes" defaultValue={String(request.notes ?? "")} /></Field>
        <SubmitButton>Update status</SubmitButton>
      </ActionForm>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Candidates</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {(Array.isArray(request.candidates) ? request.candidates : []).map((candidate) => {
            const item = candidate as Record<string, string>;
            return <li key={item.id} className="py-2">{item.name} · {item.status} · added {formatDate(item.date_added)}</li>;
          })}
        </ul>
        <h2 className="mt-6 text-sm font-semibold">Status history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {record.history.map((item) => (
            <li key={String(item.id)}>{String(item.previous_status ?? "—")} → {String(item.new_status)} <span className="text-xs text-muted-foreground">{formatDateTime(String(item.changed_at))}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
