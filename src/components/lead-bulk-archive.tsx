"use client";

import { useState } from "react";
import { archiveSelectedLeads } from "@/server/actions";
import { SubmitButton } from "@/components/forms";

export function LeadBulkArchive({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  return (
    <form
      action={async (formData) => { await archiveSelectedLeads(null, formData); }}
      onChange={(event) => {
        const form = event.currentTarget;
        setCount(form.querySelectorAll('input[name="lead_id"]:checked').length);
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SubmitButton variant="outline">Archive selected{count ? ` (${count})` : ""}</SubmitButton>
        <p className="text-xs text-muted-foreground">Bulk archive only. Permanent delete stays on the lead page.</p>
      </div>
      {children}
    </form>
  );
}
