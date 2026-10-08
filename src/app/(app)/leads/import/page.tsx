import Link from "next/link";
import { PageHeader } from "@/components/bits";
import { ImportWizard } from "@/components/import-wizard";
import { Button } from "@/components/ui/button";
import { profileCanWrite, requireUser } from "@/server/session";

export default async function ImportPage() {
  const session = await requireUser();
  const canWrite = profileCanWrite(session.profile);
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/leads", label: "Back to leads" }}
        eyebrow="Leads"
        title="Import leads"
        description={
          canWrite
            ? "The file is uploaded securely, then classified before anything is written. Duplicates are matched on email, LinkedIn URL, and company plus contact name."
            : "Importing leads is limited to Admin accounts."
        }
        actions={
          canWrite ? (
            <Button variant="outline" asChild>
              <Link href="/samples/sendpilot-export.csv">Download sample CSV</Link>
            </Button>
          ) : null
        }
      />
      {canWrite ? (
        <ImportWizard />
      ) : (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          View-only accounts cannot import leads. Ask a Sales Lead if a file needs to be loaded.
        </p>
      )}
    </div>
  );
}
