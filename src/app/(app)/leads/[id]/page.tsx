import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { AccountProfile } from "@/components/account-profile";
import { getLead, getSettings } from "@/lib/data";
import { todayInTimeZone } from "@/lib/domain";
import { firstParam } from "@/lib/format";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [lead, session, settings] = await Promise.all([getLead(id), requireUser(), getSettings()]);
  if (!lead) notFound();
  const openOpportunity = lead.opportunities.find((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold");
  if (openOpportunity) redirect(`/opportunities/${openOpportunity.id}`);
  const canWrite = profileCanWrite(session.profile);
  return (
    <AccountProfile
      canWrite={canWrite}
      tab={firstParam(query.tab) ?? "overview"}
      hrefBase={`/leads/${lead.id}`}
      contactName={lead.contact.name}
      companyName={lead.company.name}
      email={lead.contact.email}
      phone={lead.contact.phone}
      linkedInUrl={lead.contact.linkedinUrl}
      sendpilotStatus={lead.sendpilotStatus}
      notInterestedOutcome={lead.notInterestedOutcome}
      accountFlag={lead.accountFlag}
      nextAction={lead.followUps.find((item) => item.status === "open")?.title}
      nextActionDate={lead.followUps.find((item) => item.status === "open")?.dueOn}
      leadId={lead.id}
      followUps={lead.followUps}
      notes={lead.notes}
      activities={lead.activities.map((item) => ({ id: item.id, title: item.title, occurredAt: item.occurredAt }))}
      companyIndustry={lead.company.industry}
      companyWebsite={lead.company.website}
      today={todayInTimeZone(settings.businessTimezone)}
    />
  );
}
