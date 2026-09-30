"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  IMPORT_STORAGE_BUCKET,
  importFileKindError,
  importFileSizeError,
} from "@/lib/sendpilot/import-limits";

type Preview = {
  total: number;
  new: number;
  existing: number;
  updated: number;
  possible_duplicates: number;
  unmatched: number;
  archived?: number;
  suppressed?: number;
  review: number;
};

type ExceptionRow = {
  row_number?: string | null;
  display_name?: string | null;
  company?: string | null;
  classification?: string | null;
  reason?: string | null;
};

export function ImportWizard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [draft, setDraft] = useState<{ storagePath: string; filename: string } | null>(null);

  async function onPreview(formData: FormData) {
    setPending(true);
    setError(null);
    setPreview(null);
    setExceptions([]);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setPending(false);
      setError("Choose a CSV, XLS, or XLSX file.");
      return;
    }
    const kindError = importFileKindError(file.name);
    const sizeError = importFileSizeError(file.size);
    if (kindError || sizeError) {
      setPending(false);
      setError(kindError ?? sizeError);
      return;
    }
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (typeof userId !== "string") {
        setPending(false);
        setError("Sign in again, then import the file.");
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${userId}/${crypto.randomUUID()}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from(IMPORT_STORAGE_BUCKET).upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) {
        setPending(false);
        setError(
          /bucket|not found|row-level|policy/i.test(uploadError.message)
            ? "Import storage is not ready. Apply the latest Supabase migration, then retry."
            : "The file could not be uploaded. Try again.",
        );
        return;
      }
      const response = await fetch("/api/sendpilot/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, filename: file.name }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        await supabase.storage.from(IMPORT_STORAGE_BUCKET).remove([storagePath]);
        setPending(false);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "The export could not be reviewed. Try again, or split the file if it is very large.",
        );
        return;
      }
      setDraft({ storagePath, filename: file.name });
      setPreview(payload.preview);
      setExceptions(Array.isArray(payload.exceptions) ? payload.exceptions : []);
    } catch {
      setError("The export could not be reviewed. Check your connection and try again.");
    }
    setPending(false);
  }

  async function onApply() {
    if (!draft) {
      setError("Upload the export again, then confirm the import.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/sendpilot/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setPending(false);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "The export could not be imported. Review the counts and try again.",
        );
        return;
      }
      const result = payload.result ?? {};
      router.push(
        `/reconciliation?notice=${encodeURIComponent(`${result.new ?? 0} new and ${result.updated ?? 0} updated leads added. ${result.possible_duplicates ?? 0} duplicates held so you can keep or clear tagging, create a new lead, or skip.`)}`,
      );
      router.refresh();
    } catch {
      setPending(false);
      setError("The export could not be imported. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-6">
      <form action={onPreview} className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="file" className="text-sm font-medium">SendPilot export</label>
        <p className="mt-1 text-sm text-muted-foreground">CSV, XLS, or XLSX up to 15 MB and 5,000 rows. Nothing is written until you confirm the counts.</p>
        <input id="file" name="file" type="file" accept=".csv,.xls,.xlsx,text/csv" required className="mt-3 block text-sm" />
        <Button className="mt-4" type="submit" disabled={pending}>{pending ? "Reading…" : "Review import"}</Button>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </form>
      {preview ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{preview.total} records detected</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-8">
            <Count label="New" value={preview.new} />
            <Count label="Existing" value={preview.existing} />
            <Count label="Updated" value={preview.updated} />
            <Count label="Archived kept" value={preview.archived ?? 0} />
            <Count label="Possible duplicates" value={preview.possible_duplicates} />
            <Count label="Unmatched" value={preview.unmatched} />
            <Count label="Suppressed" value={preview.suppressed ?? 0} />
            <Count label="Needs review" value={preview.review ?? preview.possible_duplicates + preview.unmatched + (preview.suppressed ?? 0)} />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            New contacts will be created. Existing contacts will be updated only when the SendPilot status or an empty field changes. Archived leads stay archived. Permanently deleted SendPilot leads stay suppressed until you recreate them from review. Possible duplicates and unmatched rows are stored for review and are not turned into contacts.
          </p>
          {exceptions.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Company</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((row) => (
                    <tr key={String(row.row_number)} className="border-t border-border">
                      <td className="py-2 pr-3">{row.row_number}</td>
                      <td className="py-2 pr-3">{row.display_name || "—"}</td>
                      <td className="py-2 pr-3">{row.company || "—"}</td>
                      <td className="py-2 pr-3">{row.classification}</td>
                      <td className="py-2">{row.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Button className="mt-4" onClick={onApply} disabled={pending} type="button">
            {pending ? "Importing…" : "Confirm import"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl">{value}</p>
    </div>
  );
}
