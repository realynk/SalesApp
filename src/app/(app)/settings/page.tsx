import { controlClass, Field, PageHeader } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getSettings } from "@/lib/data";
import { sendPilotIntegrationStatus } from "@/lib/env";
import { saveSettings, updateProfile } from "@/server/actions";
import { requireUser } from "@/server/session";

export default async function SettingsPage() {
  const [settings, session] = await Promise.all([getSettings(), requireUser()]);
  const integration = sendPilotIntegrationStatus();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workspace" title="Settings" description="Thresholds control when opportunities are called stale, when profiles have waited too long, and how soon a date is called approaching." />
      <ActionForm action={saveSettings} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
        <Field label="Stale after days"><input className={controlClass} name="stale_after_days" type="number" min={1} max={180} defaultValue={settings.staleAfterDays} /></Field>
        <Field label="Profiles waiting days"><input className={controlClass} name="profiles_waiting_days" type="number" min={1} max={90} defaultValue={settings.profilesWaitingDays} /></Field>
        <Field label="Default recruitment target (business days)"><input className={controlClass} name="recruitment_target_business_days" type="number" min={1} max={60} defaultValue={settings.recruitmentTargetBusinessDays} /></Field>
        <Field label="Approaching window (days)"><input className={controlClass} name="approaching_window_days" type="number" min={1} max={30} defaultValue={settings.approachingWindowDays} /></Field>
        <Field label="Business timezone"><input className={controlClass} name="business_timezone" defaultValue={settings.businessTimezone} /></Field>
        <SubmitButton>Save thresholds</SubmitButton>
      </ActionForm>
      <section className="max-w-xl rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">SendPilot</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{integration.message}</p>
        <p className="mt-2 text-sm">File import is ready. API calls are disabled.</p>
      </section>
      <ActionForm action={updateProfile} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Your profile</h2>
        <p className="text-sm text-muted-foreground">Role: {session.profile?.role ?? "unknown"}. Additional users can be added later in Supabase Auth. This screen is not a second portal.</p>
        <Field label="Name"><input className={controlClass} name="full_name" defaultValue={session.profile?.full_name ?? ""} /></Field>
        <SubmitButton>Save profile</SubmitButton>
      </ActionForm>
    </div>
  );
}
