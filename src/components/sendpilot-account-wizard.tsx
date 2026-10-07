"use client";

import { useActionState, useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE } from "@/lib/sendpilot/campaign-sync";
import { CRM_NOT_ENABLED_MESSAGE } from "@/lib/sendpilot/manage-copy";
import { createSendPilotIntegration, verifySendPilotAccount } from "@/server/sendpilot-integrations";
import type { ActionState } from "@/server/form";

export function SendPilotAccountWizard() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [trackingMode, setTrackingMode] = useState<"all" | "selected">("all");
  const [verifyState, verifyAction] = useActionState(verifySendPilotAccount, null);
  const [saveState, saveAction] = useActionState(async (state: ActionState, formData: FormData) => {
    const result = await createSendPilotIntegration(state, formData);
    if (!result?.error) {
      setApiKey("");
      setWebhookSecret("");
    }
    return result;
  }, null);

  const verified = Boolean(verifyState?.success);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
        {["Account", "Verify", "Campaigns", "Review", "Save"].map((label, index) => (
          <li
            key={label}
            className={index + 1 === step ? "rounded-full bg-primary/10 px-2 py-1 text-primary" : "rounded-full bg-muted px-2 py-1"}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
          <Field label="Integration name">
            <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </Field>
          <Field label="SendPilot API key">
            <input
              className={controlClass}
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="SendPilot webhook signing secret">
            <input
              className={controlClass}
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button type="button" onClick={() => setStep(2)} disabled={name.trim().length < 2 || !apiKey.trim() || !webhookSecret.trim()}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <form action={verifyAction} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
          {verifyState?.error ? <p className="text-sm text-destructive">{verifyState.error}</p> : null}
          {verifyState?.success ? <p className="text-sm text-success">{verifyState.success}</p> : null}
          <input type="hidden" name="api_key" value={apiKey} />
          <p className="text-sm text-muted-foreground">
            Verification uses the existing SendPilot lead endpoint. Workspace identity is not auto-filled because this app has no workspace profile endpoint.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <SubmitButton>Verify API key</SubmitButton>
            <Button type="button" onClick={() => setStep(3)} disabled={!verified}>
              Continue
            </Button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <div className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE}</p>
          <fieldset className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={trackingMode === "all"} onChange={() => setTrackingMode("all")} />
              All campaigns
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={trackingMode === "selected"} onChange={() => setTrackingMode("selected")} />
              Selected campaigns
            </label>
          </fieldset>
          {trackingMode === "selected" ? (
            <p className="text-sm text-muted-foreground">
              No campaigns can be listed until discovery is implemented. Selected mode cannot be saved yet.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(4)} disabled={trackingMode === "selected"}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Account name</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Workspace ID</dt>
              <dd>Not verified by this app</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Campaign policy</dt>
              <dd>{trackingMode === "all" ? "All campaigns" : "Selected campaigns"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Selected campaigns</dt>
              <dd>None listed</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Webhook URL</dt>
              <dd>Generated after save: /api/sendpilot/webhook/[integrationId]</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">{CRM_NOT_ENABLED_MESSAGE}</p>
          <p className="text-sm text-muted-foreground">The API key and webhook secret are not shown again after save.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(5)}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <form action={saveAction} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
          {saveState?.error ? <p className="text-sm text-destructive">{saveState.error}</p> : null}
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="api_key" value={apiKey} />
          <input type="hidden" name="webhook_secret" value={webhookSecret} />
          <input type="hidden" name="tracking_mode" value={trackingMode} />
          <p className="text-sm text-muted-foreground">
            Saves as draft. CRM synchronization stays off. Paste the webhook URL into SendPilot yourself later — this app will not create the webhook.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(4)}>
              Back
            </Button>
            <SubmitButton>Save draft integration</SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
