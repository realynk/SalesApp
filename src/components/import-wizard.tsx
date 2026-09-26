"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { applyImport, previewImport } from "@/server/actions";

type Preview = {
  total: number;
  new: number;
  existing: number;
  updated: number;
  possible_duplicates: number;
  unmatched: number;
  rows: Array<Record<string, string | null>>;
};

export function ImportWizard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<unknown[]>([]);
  const [filename, setFilename] = useState("");
  const [source, setSource] = useState<"csv" | "xls" | "xlsx">("csv");

  async function onPreview(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await previewImport(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.preview);
    setRows(result.rows);
    setFilename(result.filename);
    setSource(result.source);
  }

  async function onApply() {
    setPending(true);
    setError(null);
    const result = await applyImport({ filename, source, rows });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/reconciliation?notice=${encodeURIComponent(`${result.result.new} new, ${result.result.updated} updated, ${result.result.possible_duplicates} duplicates held for review.`)}`);
    router.refresh();
  }

  const exceptions = preview?.rows.filter((row) => row.classification !== "new" && row.classification !== "existing") ?? [];

  return (
    <div className="space-y-6">
      <form action={onPreview} className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="file" className="text-sm font-medium">SendPilot export</label>
        <p className="mt-1 text-sm text-muted-foreground">CSV, XLS, or XLSX. Nothing is written until you confirm the counts.</p>
        <input id="file" name="file" type="file" accept=".csv,.xls,.xlsx,text/csv" required className="mt-3 block text-sm" />
        <Button className="mt-4" type="submit" disabled={pending}>{pending ? "Reading…" : "Review import"}</Button>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </form>
      {preview ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{preview.total} records detected</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Count label="New" value={preview.new} />
            <Count label="Existing" value={preview.existing} />
            <Count label="Updated" value={preview.updated} />
            <Count label="Possible duplicates" value={preview.possible_duplicates} />
            <Count label="Unmatched" value={preview.unmatched} />
            <Count label="Needs review" value={preview.possible_duplicates + preview.unmatched} />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            New contacts will be created. Existing contacts will be updated only when the SendPilot status or an empty field changes. Possible duplicates and unmatched rows are stored for review and are not turned into contacts.
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
                  {exceptions.slice(0, 40).map((row) => (
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
