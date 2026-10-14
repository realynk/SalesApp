import Link from "next/link";
import { controlClass, Field, PageHeader, SectionCard } from "@/components/bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getSettings } from "@/lib/data";
import { saveSettings, updateProfile } from "@/server/actions";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function SettingsPage() {
  const [settings, session] = await Promise.all([getSettings(), requireUser()]);
  const canWrite = profileCanWrite(session.profile);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workspace" title="Settings" />
      <div className="max-w-xl">
        <SectionCard
          collapsible
          title="Thresholds"
          description="When a reminder is approaching and when a card is stale."
        >
          {canWrite ? (
          <ActionForm action={saveSettings} className="grid gap-3">
            <Field label="Stale after days"><input className={controlClass} name="stale_after_days" type="number" min={1} max={180} defaultValue={settings.staleAfterDays} /></Field>
            <Field label="Profiles waiting days"><input className={controlClass} name="profiles_waiting_days" type="number" min={1} max={90} defaultValue={settings.profilesWaitingDays} /></Field>
            <Field label="Default recruitment target (business days)"><input className={controlClass} name="recruitment_target_business_days" type="number" min={1} max={60} defaultValue={settings.recruitmentTargetBusinessDays} /></Field>
            <Field label="Approaching window (days)"><input className={controlClass} name="approaching_window_days" type="number" min={1} max={30} defaultValue={settings.approachingWindowDays} /></Field>
            <Field label="Business timezone"><input className={controlClass} name="business_timezone" defaultValue={settings.businessTimezone} /></Field>
            <SubmitButton>Save thresholds</SubmitButton>
          </ActionForm>
          ) : (
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-xs text-muted-foreground uppercase">Stale after days</dt><dd>{settings.staleAfterDays}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Profiles waiting days</dt><dd>{settings.profilesWaitingDays}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Recruitment target (business days)</dt><dd>{settings.recruitmentTargetBusinessDays}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Approaching window (days)</dt><dd>{settings.approachingWindowDays}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Business timezone</dt><dd>{settings.businessTimezone}</dd></div>
            </dl>
          )}
        </SectionCard>
      </div>
      <section className="max-w-xl rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {canWrite ? "Connect SendPilot accounts here." : "View SendPilot accounts connected to this workspace."}
        </p>
        <p className="mt-3">
          <Link className="text-sm font-medium text-primary" href="/settings/sendpilot">
            Open SendPilot
          </Link>
        </p>
      </section>
      <ActionForm action={updateProfile} className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Your profile</h2>
        <Field label="Name"><input className={controlClass} name="full_name" defaultValue={session.profile?.full_name ?? ""} /></Field>
        <SubmitButton>Save profile</SubmitButton>
      </ActionForm>
    </div>
  );
}
