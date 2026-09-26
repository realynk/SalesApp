import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-xl font-semibold">That record is not in the workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been removed, or the link is incomplete.</p>
      <Link className="mt-4 inline-block text-sm text-primary underline" href="/dashboard">Back to the command center</Link>
    </div>
  );
}
