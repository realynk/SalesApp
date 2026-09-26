import { ActionForm, SubmitButton } from "@/components/forms";
import { controlClass } from "@/components/bits";
import { signIn } from "@/server/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Realynk Assistants</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales & Growth</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Private workspace for the Sales & Growth Lead. Accounts are created in Supabase Auth, not from this screen.
      </p>
      <ActionForm action={signIn} className="mt-8 space-y-4 rounded-xl border border-border bg-card p-5">
        <input type="hidden" name="next" value={query.next ?? "/dashboard"} />
        <label className="block space-y-1.5 text-sm">
          <span>Email</span>
          <input className={controlClass} name="email" type="email" autoComplete="username" required />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span>Password</span>
          <input className={controlClass} name="password" type="password" autoComplete="current-password" required />
        </label>
        {query.error ? <p className="text-sm text-destructive">The sign-in link could not be confirmed.</p> : null}
        <SubmitButton>Sign in</SubmitButton>
      </ActionForm>
    </main>
  );
}
