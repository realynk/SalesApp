import { notFound } from "next/navigation";
import { PageHeader } from "@/components/bits";
import { CopyWebhookUrl } from "@/components/copy-webhook-url";
import { SendPilotIntegrationManage } from "@/components/sendpilot-integration-manage";
import { formatDateTime } from "@/lib/format";
import { canManageSendPilotCredentials } from "@/lib/sendpilot/credentials";
import { SUPPORTED_SENDPILOT_EVENTS } from "@/lib/sendpilot/events";
import { fieldCredentialLabel, statusHeadline } from "@/lib/sendpilot/manage";
import { CRM_NOT_ENABLED_MESSAGE, LEGACY_PROTECTED_MESSAGE, WEBHOOK_SETUP_MESSAGE } from "@/lib/sendpilot/manage-copy";
import { loadSendPilotIntegrationDetail } from "@/lib/sendpilot/settings-data";
import { requireUser } from "@/server/session";

export default async function SendPilotIntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireUser();
  const detail = await loadSendPilotIntegrationDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/settings/sendpilot", label: "Back to SendPilot" }}
        eyebrow="Integrations"
        title={detail.name}
        description={statusHeadline(detail)}
      />

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Status</dt>
            <dd className="mt-1 capitalize">{detail.status}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Tracking</dt>
            <dd className="mt-1">{detail.trackingMode === "all" ? "All campaigns" : "Selected campaigns"}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">API key</dt>
            <dd className="mt-1">{fieldCredentialLabel({ legacyEnv: detail.legacyEnv, configured: detail.apiKeyConfigured })}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Webhook secret</dt>
            <dd className="mt-1">
              {fieldCredentialLabel({ legacyEnv: detail.legacyEnv, configured: detail.webhookSecretConfigured })}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Workspace ID</dt>
            <dd className="mt-1">{detail.workspaceId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Known campaigns</dt>
            <dd className="mt-1">{detail.campaignCount}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Tracked</dt>
            <dd className="mt-1">{detail.trackedCount}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Last webhook</dt>
            <dd className="mt-1">
              {formatDateTime(detail.lastWebhookAt)}
              {detail.lastWebhookEventType ? ` · ${detail.lastWebhookEventType}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Last campaign sync</dt>
            <dd className="mt-1">{formatDateTime(detail.lastCampaignSyncAt)}</dd>
          </div>
        </dl>
        {detail.legacyEnv ? (
          <p className="text-sm text-muted-foreground">{LEGACY_PROTECTED_MESSAGE} Webhook connected via the existing production URL.</p>
        ) : (
          <p className="text-sm text-muted-foreground">{CRM_NOT_ENABLED_MESSAGE}</p>
        )}
        <div>
          <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Webhook URL</p>
          <CopyWebhookUrl url={detail.webhookUrl} />
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.legacyEnv
              ? "This is the existing Realynk Main webhook. Do not replace it in SendPilot from this screen."
              : WEBHOOK_SETUP_MESSAGE}
          </p>
          {detail.legacyEnv ? null : (
            <p className="mt-2 text-sm text-muted-foreground">
              Supported events: {SUPPORTED_SENDPILOT_EVENTS.join(", ")}.
            </p>
          )}
        </div>
      </section>

      <SendPilotIntegrationManage detail={detail} canManage={canManageSendPilotCredentials(profile?.role)} />

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        {detail.audits.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No management events recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {detail.audits.map((audit) => (
              <li key={audit.id} className="flex flex-wrap justify-between gap-3 py-2">
                <span>{audit.action.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">{formatDateTime(audit.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
