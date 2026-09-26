import Link from "next/link";
import { PageHeader } from "@/components/bits";
import { ImportWizard } from "@/components/import-wizard";
import { Button } from "@/components/ui/button";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/leads", label: "Back to leads" }}
        eyebrow="SendPilot"
        title="Import leads"
        description="The file is classified before anything is written. Duplicates are matched on email, LinkedIn URL, and company plus contact name."
        actions={<Button variant="outline" asChild><Link href="/samples/sendpilot-export.csv">Download sample CSV</Link></Button>}
      />
      <ImportWizard />
    </div>
  );
}
