import { PageHeader } from "@/components/bits";
import { SendPilotAccountWizard } from "@/components/sendpilot-account-wizard";
import { canManageSendPilotCredentials } from "@/lib/sendpilot/credentials";
import { SENDPILOT_ADMIN_DENIED } from "@/lib/sendpilot/manage-copy";
import { requireUser } from "@/server/session";

export default async function NewSendPilotIntegrationPage() {
  const { profile } = await requireUser();
  const canManage = canManageSendPilotCredentials(profile?.role);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/settings/sendpilot", label: "Back to SendPilot" }}
        eyebrow="Integrations"
        title="Add SendPilot Account"
        description="Create a draft account first. The unique webhook URL appears after save so you can create the SendPilot webhook and paste the signing secret afterward."
      />
      {canManage ? (
        <SendPilotAccountWizard />
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-sm">{SENDPILOT_ADMIN_DENIED}</p>
      )}
    </div>
  );
}
