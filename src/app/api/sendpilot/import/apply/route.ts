import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { applyStoredImport } from "@/lib/sendpilot/import-server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function requireImporter() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return { error: NextResponse.json({ error: "Sign in to import SendPilot files." }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) {
    return { error: NextResponse.json({ error: "Your account cannot import leads." }, { status: 403 }) };
  }
  return { supabase, userId };
}

export async function POST(request: Request) {
  try {
    const auth = await requireImporter();
    if ("error" in auth) return auth.error;
    const value = await request.json().catch(() => null);
    const storagePath = value && typeof value === "object" && typeof (value as { storagePath?: unknown }).storagePath === "string"
      ? (value as { storagePath: string }).storagePath.trim()
      : "";
    const filename = value && typeof value === "object" && typeof (value as { filename?: unknown }).filename === "string"
      ? (value as { filename: string }).filename.trim()
      : "";
    if (!storagePath || !filename) {
      return NextResponse.json({ error: "Upload the export again, then confirm the import." }, { status: 400 });
    }
    const result = await applyStoredImport(auth.supabase, auth.userId, storagePath, filename);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    revalidatePath("/leads");
    revalidatePath("/reconciliation");
    revalidatePath("/dashboard");
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sendpilot.import.apply]", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json(
      { error: "The export could not be imported. Review the file and try again." },
      { status: 500 },
    );
  }
}
