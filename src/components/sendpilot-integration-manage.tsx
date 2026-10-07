"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { controlClass, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE } from "@/lib/sendpilot/campaign-sync";
import { ACTIVATION_BLOCKED, CRM_NOT_ENABLED_MESSAGE, LEGACY_PROTECTED_MESSAGE } from "@/lib/sendpilot/manage-copy";
import type { SendPilotIntegrationDetail } from "@/lib/sendpilot/settings-data";
import {
  activateSendPilotIntegration,
  disableSendPilotIntegration,
  removeSendPilotIntegration,
  rotateSendPilotCredentials,
  saveSendPilotTracking,
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

  return (
    <div className="grid gap-4">
      {!detail.crmSyncEnabled ? <p className="text-sm text-muted-foreground">{CRM_NOT_ENABLED_MESSAGE}</p> : null}

      <ActionForm action={saveSendPilotTracking} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Campaign tracking</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
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

      <ActionForm action={rotateSendPilotCredentials} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Rotate credentials</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
        <Field label="New API key">
          <input className={controlClass} type="password" name="api_key" autoComplete="new-password" />
        </Field>
        <Field label="New webhook signing secret">
          <input className={controlClass} type="password" name="webhook_secret" autoComplete="new-password" />
        </Field>
        <SubmitButton>Rotate credentials</SubmitButton>
      </ActionForm>

      <ActionForm action={activateSendPilotIntegration} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Activation</h2>
        <input type="hidden" name="integration_id" value={detail.id} />
        <p className="text-sm text-muted-foreground">{ACTIVATION_BLOCKED}</p>
        <Button type="submit" variant="outline" disabled>
          Activate (unavailable)
        </Button>
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
