"use client";

import { useActionState, useState } from "react";
import { controlClass, Field } from "@/components/bits";
import { SubmitButton } from "@/components/forms";
import { TRACKING_ONBOARDING_MESSAGE } from "@/lib/sendpilot/manage-copy";
import { createSendPilotIntegration } from "@/server/sendpilot-integrations";
import type { ActionState } from "@/server/form";

export function SendPilotAccountWizard() {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saveState, saveAction] = useActionState(async (state: ActionState, formData: FormData) => {
    const result = await createSendPilotIntegration(state, formData);
    if (!result?.error) setApiKey("");
    return result;
  }, null);

  return (
    <form action={saveAction} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
      {saveState?.error ? <p className="text-sm text-destructive">{saveState.error}</p> : null}
      <p className="text-sm text-muted-foreground">
        Step 1 — Create Account. The unique webhook URL is generated after this draft exists. Do not enter a webhook
        signing secret yet.
      </p>
      <Field label="Integration name">
        <input
          className={controlClass}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          required
        />
      </Field>
      <Field label="SendPilot API key">
        <input
          className={controlClass}
          type="password"
          name="api_key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>
      <input type="hidden" name="tracking_mode" value="all" />
      <p className="text-sm text-muted-foreground">{TRACKING_ONBOARDING_MESSAGE}</p>
      <p className="text-sm text-muted-foreground">
        Saves as draft. CRM synchronization stays off until you explicitly activate the integration.
      </p>
      <SubmitButton>Create draft account</SubmitButton>
    </form>
  );
}
