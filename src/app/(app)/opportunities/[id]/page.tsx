import { notFound } from "next/navigation";
import { AccountProfile } from "@/components/account-profile";
import { getOpportunity } from "@/lib/data";
import { liveSalesCallValuesFromRow } from "@/lib/live-sales-call";
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
      notInterestedOutcome={opportunity.notInterestedOutcome}
      stage={opportunity.stage}
      accountFlag={opportunity.accountFlag}
      nextAction={opportunity.nextAction}
      nextActionDate={opportunity.nextActionDate}
      nextActionManual={opportunity.nextActionManual}
      leadId={opportunity.leadId}
      opportunityId={opportunity.id}
      followUps={opportunity.followUps}
      notes={opportunity.notes}
      activities={opportunity.activities.map((item) => ({ id: item.id, title: item.title, occurredAt: item.occurredAt }))}
      history={opportunity.history}
      lostReason={opportunity.lostReason}
      talentRequestSentOn={opportunity.talentRequestSentOn}
      strategyNotes={opportunity.strategyCall ? String(opportunity.strategyCall.notes ?? "") : opportunity.notesText}
      liveSalesCall={liveSalesCallValuesFromRow(opportunity.strategyCall)}
      recruitmentStatus={opportunity.recruitment ? String(opportunity.recruitment.status ?? "") : null}
      contractStatus={opportunity.contract ? String(opportunity.contract.status ?? "") : null}
      targetStartOn={opportunity.targetStartOn}
      clientStartOn={opportunity.client ? String(opportunity.client.start_date ?? "") || null : null}
      vaCount={opportunity.client ? Number(opportunity.client.number_of_vas ?? 0) || null : null}
      waitingOn={opportunity.waitingOn}
      riskLevel={opportunity.riskLevel}
      companyIndustry={opportunity.companyIndustry}
      companyWebsite={opportunity.companyWebsite}
      today={opportunity.today}
    />
  );
}
