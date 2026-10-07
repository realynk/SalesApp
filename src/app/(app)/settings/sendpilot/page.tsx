import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { credentialStatusLabel, statusHeadline } from "@/lib/sendpilot/manage";
import { CRM_NOT_ENABLED_MESSAGE, LEGACY_PROTECTED_MESSAGE } from "@/lib/sendpilot/manage-copy";
import { loadSendPilotIntegrationList } from "@/lib/sendpilot/settings-data";
import { requireUser } from "@/server/session";

export default async function SendPilotIntegrationsPage() {
  await requireUser();
  const { canManage, integrations } = await loadSendPilotIntegrationList();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/settings", label: "Back to settings" }}
        eyebrow="Integrations"
        title="SendPilot Integrations"
        description="Manage SendPilot accounts used by this workspace. CRM synchronization stays limited to the legacy Realynk Main webhook until a later phase."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/settings/sendpilot/new">Add SendPilot Account</Link>
            </Button>
          ) : null
        }
      />

      {!canManage ? (
        <p className="text-sm text-muted-foreground">You can view integrations. Only a sales lead can add or change them.</p>
      ) : null}

      {integrations.length === 0 ? (
        <EmptyState
          title="No SendPilot integrations"
          body="When the Realynk Main backfill is present it will appear here. Future accounts can be added as drafts without turning on CRM sync."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/settings/sendpilot/new">Add SendPilot Account</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {integrations.map((integration) => (
            <article key={integration.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{integration.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{statusHeadline(integration)}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/settings/sendpilot/${integration.id}`}>{integration.legacyEnv ? "View" : "Manage"}</Link>
                </Button>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Campaigns</dt>
                  <dd className="mt-1">
                    {integration.trackingMode === "all"
                      ? "All campaigns"
                      : `Selected • ${integration.trackedCount} campaign${integration.trackedCount === 1 ? "" : "s"}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Credentials</dt>
                  <dd className="mt-1">{credentialStatusLabel(integration.credentialStatus)}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Workspace ID</dt>
                  <dd className="mt-1">{integration.workspaceId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Last webhook</dt>
                  <dd className="mt-1">{formatDateTime(integration.lastWebhookAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Last campaign sync</dt>
                  <dd className="mt-1">{formatDateTime(integration.lastCampaignSyncAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Created</dt>
                  <dd className="mt-1">{formatDateTime(integration.createdAt)}</dd>
                </div>
              </dl>
              {integration.legacyEnv ? (
                <p className="mt-3 text-sm text-muted-foreground">{LEGACY_PROTECTED_MESSAGE}</p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  CRM Sync: Not enabled yet. {CRM_NOT_ENABLED_MESSAGE}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
