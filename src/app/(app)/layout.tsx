import type { ReactNode } from "react";
import { DataError } from "@/components/bits";
import { Shell } from "@/components/shell";
import { getCommandCenter } from "@/lib/data";
import { AppDataError } from "@/lib/errors";
import { signOut } from "@/server/actions";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  if (!session.profile) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold">Internal profile missing</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This login does not have a row in profiles. Apply the migration so new Supabase users receive an internal profile, then sign out and back in.
        </p>
        <form action={signOut} className="mt-4">
          <button className="text-sm underline" type="submit">Sign out</button>
        </form>
      </main>
    );
  }

  let center;
  try {
    center = await getCommandCenter();
  } catch (error) {
    if (error instanceof AppDataError) return <DataError message={error.message} />;
    throw error;
  }

  const attentionCount = center.attention.filter((item) => item.sections.includes("needs") || item.sections.includes("today")).length;
  return (
    <Shell name={session.profile.full_name} attentionCount={attentionCount}>
      {children}
    </Shell>
  );
}
