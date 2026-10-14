import { NextResponse } from "next/server";
import { canWriteCrm } from "@/lib/authz";
import { type MomFacts } from "@/lib/mom-email";
import { generateMomFromRecording } from "@/lib/mom-ai";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

function readFacts(raw: string | null): MomFacts | null {
  if (!raw?.trim()) return null;
  try {
    const value = JSON.parse(raw) as MomFacts;
    if (!value || typeof value !== "object") return null;
    if (typeof value.contactName !== "string" || typeof value.companyName !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return NextResponse.json({ error: "Sign in to generate meeting notes." }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || !canWriteCrm((profile as { role?: string }).role)) {
    return NextResponse.json({ error: "Your account cannot generate meeting notes." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "The request could not be read." }, { status: 400 });
  const facts = readFacts(typeof form.get("facts") === "string" ? String(form.get("facts")) : null);
  if (!facts) return NextResponse.json({ error: "Company and contact are required." }, { status: 400 });
  const uploaded = form.get("recording");
  const recording = uploaded instanceof File && uploaded.size > 0 ? uploaded : null;
  const result = await generateMomFromRecording({ facts, recording });
  return NextResponse.json(result);
}
