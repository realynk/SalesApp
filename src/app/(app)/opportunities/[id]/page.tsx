import { notFound } from "next/navigation";
import { AccountProfile } from "@/components/account-profile";
import { getOpportunity } from "@/lib/data";
import { firstParam } from "@/lib/format";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [opportunity, session] = await Promise.all([getOpportunity(id), requireUser()]);
  if (!opportunity) notFound();
  const canWrite = profileCanWrite(session.profile);
  return (
    <AccountProfile
      canWrite={canWrite}
      tab={firstParam(query.tab) ?? "overview"}
      hrefBase={`/opportunities/${opportunity.id}`}
      contactName={opportunity.contactName}
      companyName={opportunity.companyName}
      email={opportunity.email}
      phone={opportunity.phone}
      linkedInUrl={opportunity.linkedInUrl}
      sendpilotStatus={opportunity.sendpilotStatus}
      stage={opportunity.stage}
      accountFlag={opportunity.accountFlag}
      nextAction={opportunity.nextAction}
      nextActionDate={opportunity.nextActionDate}
      nextActionManual={opportunity.nextActionManual}
      leadId={opportunity.leadId}
      opportunityId={opportunity.id}
      followUps={mergedWorkItems(opportunity.followUps, opportunity.tasks)}
      notes={opportunity.notes}
      activities={opportunity.activities.map((item) => ({ id: item.id, title: item.title, occurredAt: item.occurredAt }))}
      history={opportunity.history}
      lostReason={opportunity.lostReason}
      talentRequestSentOn={opportunity.talentRequestSentOn}
      strategyNotes={opportunity.strategyCall ? String(opportunity.strategyCall.notes ?? "") : opportunity.notesText}
      recruitmentStatus={opportunity.recruitment ? String(opportunity.recruitment.status ?? "") : null}
      contractStatus={opportunity.contract ? String(opportunity.contract.status ?? "") : null}
      targetStartOn={opportunity.targetStartOn}
      companyIndustry={opportunity.companyIndustry}
      companyWebsite={opportunity.companyWebsite}
      today={opportunity.today}
    />
  );
}

function mergedWorkItems(
  followUps: Array<{ id: string; title: string; dueOn: string; status: string; notes?: string | null }>,
  tasks: Array<{ id: string; title: string; details: string | null; status: string; dueOn: string | null }>,
) {
  const seen = new Set(followUps.map((item) => `${item.title}|${item.dueOn}`));
  const extras = tasks
    .filter((item) => item.status === "open" || item.status === "done")
    .filter((item) => !seen.has(`${item.title}|${item.dueOn ?? ""}`))
    .map((item) => ({
      id: item.id,
      title: item.title,
      dueOn: item.dueOn ?? "",
      status: item.status === "done" ? "completed" : item.status,
      notes: item.details,
    }));
  return [...followUps, ...extras];
}
