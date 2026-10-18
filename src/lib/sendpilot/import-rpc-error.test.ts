import assert from "node:assert/strict";
import test from "node:test";
import { importRpcError } from "./import-rpc-error.ts";

test("maps Postgres 42501 from the import RPC to a migration action instead of a generic save error", () => {
  assert.match(
    importRpcError({
      code: "42501",
      message: "permission denied for function active_suppression_id",
    }),
    /latest Supabase migration/,
  );
  assert.equal(
    importRpcError({ message: "Import is limited to 5000 rows at a time" }),
    "Import is limited to 5000 rows at a time",
  );
});
