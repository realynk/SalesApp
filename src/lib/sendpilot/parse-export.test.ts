import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { importFileSizeError, importPreviewRequestBody } from "./import-limits.ts";
import { exceptionPreviewRows, mappedImportRowsFromRecords, parseSendPilotExport } from "./parse-export.ts";

function csvLargerThan1Mb() {
  const header = "Name,Company,Email,SendPilot Status,LinkedIn URL,Notes\n";
  const chunks = [header];
  let bytes = Buffer.byteLength(header);
  let n = 0;
  while (bytes < 1_100_000 && n < 5000) {
    n += 1;
    const line = `Lead ${n} with a longer exported name,Acme Holdings ${n % 50} International,lead${n}@example-company.test,Interested,https://www.linkedin.com/in/lead-profile-${n}-extra-path,${"note ".repeat(20)}\n`;
    chunks.push(line);
    bytes += Buffer.byteLength(line);
  }
  return { csv: chunks.join(""), bytes, rows: n };
}

test("rejects files over the 15 MB storage limit and allows a payload larger than the 1 MB Server Action cap", () => {
  assert.equal(importFileSizeError(1_100_000), null);
  assert.match(importFileSizeError(16 * 1024 * 1024) ?? "", /15 MB/);
  const request = importPreviewRequestBody("user-id/draft/export.csv", "export.csv");
  assert.ok(Buffer.byteLength(request) < 1024);
});

test("parses a CSV import larger than 1 MB without putting it in a Server Action body", () => {
  const { csv, bytes, rows } = csvLargerThan1Mb();
  assert.ok(bytes > 1_000_000);
  const parsed = parseSendPilotExport(new TextEncoder().encode(csv), "sendpilot-export.csv");
  if (!parsed.ok) {
    assert.fail(parsed.error);
  }
  assert.equal(parsed.rows.length, rows);
  assert.equal(parsed.source, "csv");
  assert.equal(parsed.rows[0]?.email, "lead1@example-company.test");
  const mapped = mappedImportRowsFromRecords([{ Name: "A", Company: "B", Email: "a@b.com", Status: "Interested" }]);
  assert.equal(mapped[0]?.sendpilot_status, "Interested");
  const exceptions = exceptionPreviewRows([
    { classification: "new", display_name: "Keep" },
    { classification: "suppressed", display_name: "Held" },
    { classification: "archived", display_name: "Quiet" },
  ]);
  assert.deepEqual(exceptions.map((row) => row.display_name), ["Held"]);
  assert.equal(createHash("sha256").update(csv).digest("hex").length, 64);
});
