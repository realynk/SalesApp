import { actionError } from "@/lib/errors";

export function importRpcError(error: { message: string; code?: string } | null) {
  if (error?.code === "42501") {
    return "The import is missing a database permission. Apply the latest Supabase migration, then try again.";
  }
  return actionError(error);
}
