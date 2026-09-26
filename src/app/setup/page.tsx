export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Realynk Assistants</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales & Growth Command Center</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        This internal app is ready to connect to Supabase. It does not ship with a stand-in database or a pretend SendPilot API.
      </p>
      <ol className="mt-6 space-y-3 text-sm leading-6">
        <li>1. Create a Supabase project and run <code className="rounded bg-muted px-1">supabase/migrations/20260923170000_command_center.sql</code>.</li>
        <li>2. In Authentication, create the Sales & Growth Lead and turn off public sign-ups.</li>
        <li>3. Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in Vercel, then redeploy.</li>
        <li>4. Sign in and load the sample workspace, or import a SendPilot CSV, XLS, or XLSX export.</li>
      </ol>
    </main>
  );
}
