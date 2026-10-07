"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE } from "@/lib/sendpilot/campaign-sync";
import { SUPPORTED_SENDPILOT_EVENTS } from "@/lib/sendpilot/events";
import {
  fieldCredentialLabel,
  PHASE_5_SCOPED_MATCHING_AVAILABLE,
  planActivation,
} from "@/lib/sendpilot/manage";
import {
  CRM_NOT_ENABLED_MESSAGE,
  LEGACY_PROTECTED_MESSAGE,
  TRACKING_ONBOARDING_MESSAGE,
  WEBHOOK_SETUP_MESSAGE,
} from "@/lib/sendpilot/manage-copy";
import type { SendPilotIntegrationDetail } from "@/lib/sendpilot/settings-data";
import {
  activateSendPilotIntegration,
  disableSendPilotIntegration,
  removeSendPilotIntegration,
  saveSendPilotApiKey,
  saveSendPilotTracking,
  saveSendPilotWebhookSecret,
  syncSendPilotCampaigns,
} from "@/server/sendpilot-integrations";

export function SendPilotIntegrationManage({
  detail,
  canManage,
}: {
  detail: SendPilotIntegrationDetail;
  canManage: boolean;
}) {
  if (!canManage) {
    return <p className="text-sm text-muted-foreground">You can view this integration. Changes require a sales lead.</p>;
  }

  if (detail.legacyEnv) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Protected actions</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{LEGACY_PROTECTED_MESSAGE}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Disable, remove, credential rotation, and tracking changes are unavailable here so the live webhook is not disturbed.
        </p>
      </section>
    );
  }

  const activation = planActivation({
    legacyEnv: detail.legacyEnv,
    status: detail.status,
    apiKeyConfigured: detail.apiKeyConfigured,
    webhookSecretConfigured: detail.webhookSecretConfigured,
    trackingMode: detail.trackingMode,
    selectedCampaignIds: detail.campaigns.filter((campaign) => campaign.tracked).map((campaign) => campaign.sendpilotCampaignId),
    integrationId: detail.id,
    scopedMatchingEnabled: PHASE_5_SCOPED_MATCHING_AVAILABLE,
  });
  const activationReady = !("error" in activation);

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
        {["Account", "Webhook", "Credentials", "Tracking", "Activate"].map((label) => (
          <li key={label} className="rounded-full bg-muted px-2 py-1">
            {label}
          </li>
        ))}
      </ol>

      {!detail.crmSyncEnabled ? <p className="text-sm text-muted-foreground">{CRM_NOT_ENABLED_MESSAGE}</p> : null}

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Account name</dt>
            <dd>{detail.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{detail.status}</dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Webhook</h2>
        <p className="text-sm text-muted-foreground">{WEBHOOK_SETUP_MESSAGE}</p>
        <p className="text-sm text-muted-foreground">
          Subscribe this SalesApp to these SendPilot events: {SUPPORTED_SENDPILOT_EVENTS.join(", ")}.
        </p>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Credentials</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">API key</dt>
            <dd>{fieldCredentialLabel({ legacyEnv: false, configured: detail.apiKeyConfigured })}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Webhook secret</dt>
            <dd>{fieldCredentialLabel({ legacyEnv: false, configured: detail.webhookSecretConfigured })}</dd>
          </div>
        </dl>

        <ActionForm action={saveSendPilotApiKey} className="grid gap-3">
          <input type="hidden" name="integration_id" value={detail.id} />
          <Field label="API key">
            <input className={controlClass} type="password" name="api_key" autoComplete="new-password" />
          </Field>
          <SubmitButton>{detail.apiKeyConfigured ? "Rotate API key" : "Save API key"}</SubmitButton>
        </ActionForm>

        <ActionForm action={saveSendPilotWebhookSecret} className="grid gap-3">
          <input type="hidden" name="integration_id" value={detail.id} />
          <h3 className="text-sm font-medium">Webhook Signing Secret</h3>
          {detail.webhookSecretConfigured ? (
            <p className="text-sm">Webhook secret: Configured</p>
          ) : (
            <p className="text-sm text-muted-foreground">Paste the signing secret SendPilot shows after you create the webhook.</p>
          )}
          <Field label="Webhook signing secret">
            <input className={controlClass} type="password" name="webhook_secret" autoComplete="new-password" />
          </Field>
          <SubmitButton>{detail.webhookSecretConfigured ? "Rotate webhook secret" : "Save webhook secret"}</SubmitButton>
        </ActionForm>
      </section>

      <ActionForm action={saveSendPilotTracking} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Tracking</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
        <p className="text-sm text-muted-foreground">{TRACKING_ONBOARDING_MESSAGE}</p>
        <fieldset className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="tracking_mode" value="all" defaultChecked={detail.trackingMode === "all"} />
            All campaigns
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tracking_mode" value="selected" defaultChecked={detail.trackingMode === "selected"} />
            Selected campaigns
          </label>
        </fieldset>
        {detail.campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No campaigns are stored for this account yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.campaigns.map((campaign) => (
              <li key={campaign.sendpilotCampaignId}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="campaign_id"
                    value={campaign.sendpilotCampaignId}
                    defaultChecked={campaign.tracked}
                  />
                  {campaign.name || campaign.sendpilotCampaignId}
                </label>
              </li>
            ))}
          </ul>
        )}
        <SubmitButton>Save tracking</SubmitButton>
      </ActionForm>

      <ActionForm action={syncSendPilotCampaigns} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Campaign discovery</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
        <p className="text-sm text-muted-foreground">{CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE}</p>
        <SubmitButton>Sync campaigns</SubmitButton>
      </ActionForm>

      <ActionForm action={activateSendPilotIntegration} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Activate</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
        <p className="text-sm text-muted-foreground">
          Draft stays draft until you activate. Activation requires API key, webhook secret, valid tracking, the dynamic
          webhook URL, and the Phase 5 CRM path.
        </p>
        {activationReady ? (
          <SubmitButton>Activate Integration</SubmitButton>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{"error" in activation ? activation.error : null}</p>
            <Button type="submit" variant="outline" disabled>
              Activate Integration
            </Button>
          </>
        )}
      </ActionForm>

      {detail.status !== "removed" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ActionForm action={disableSendPilotIntegration} className="grid gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Disable</h2>
            <input type="hidden" name="integration_id" value={detail.id} />
            <p className="text-sm text-muted-foreground">Keeps credentials, campaigns, and history. Incoming webhooks verify then ignore.</p>
            <SubmitButton variant="outline">Disable integration</SubmitButton>
          </ActionForm>
          <ActionForm action={removeSendPilotIntegration} className="grid gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Remove</h2>
            <input type="hidden" name="integration_id" value={detail.id} />
            <p className="text-sm text-muted-foreground">
              Soft-remove only. History stays. Remove the webhook in SendPilot manually later.
            </p>
            <SubmitButton variant="destructive">Mark removed</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
