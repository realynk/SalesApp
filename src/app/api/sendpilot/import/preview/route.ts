import { NextResponse } from "next/server";
import { canWriteCrm } from "@/lib/authz";
import { previewStoredImport } from "@/lib/sendpilot/import-server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function requireImporter() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return { error: NextResponse.json({ error: "Sign in to import SendPilot files." }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (!profile || !canWriteCrm((profile as { role?: string }).role)) {
    return { error: NextResponse.json({ error: "Your account cannot import leads." }, { status: 403 }) };
  }
  return { supabase, userId };
}

function readBody(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const storagePath = typeof record.storagePath === "string" ? record.storagePath.trim() : "";
  const filename = typeof record.filename === "string" ? record.filename.trim() : "";
  if (!storagePath || !filename) return null;
  return { storagePath, filename };
}

export async function POST(request: Request) {
  try {
    const auth = await requireImporter();
    if ("error" in auth) return auth.error;
    const body = readBody(await request.json().catch(() => null));
    if (!body) {
      return NextResponse.json({ error: "Upload the export again, then review the import." }, { status: 400 });
    }
    const result = await previewStoredImport(auth.supabase, auth.userId, body.storagePath, body.filename);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sendpilot.import.preview]", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json(
      { error: "The export could not be reviewed. Try again, or split the file if it is very large." },
      { status: 500 },
    );
  }
}
