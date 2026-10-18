import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canWriteCrm } from "@/lib/authz";
import { appOrigin } from "@/lib/auth/origin";
import { GMAIL_OAUTH_STATE_COOKIE, gmailRedirectUri } from "@/lib/gmail/config";
import { upsertGmailConnection } from "@/lib/gmail/connection";
import { exchangeGmailAuthCode } from "@/lib/gmail/send";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = (await appOrigin()) || url.origin;
  const nonce = (await cookies()).get(GMAIL_OAUTH_STATE_COOKIE)?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  const [stateNonce, packedNext] = state.split(".");
  let next = "/settings";
  try {
    if (packedNext) {
      const decoded = Buffer.from(packedNext, "base64url").toString("utf8");
      if (decoded.startsWith("/") && !decoded.startsWith("//")) next = decoded;
    }
  } catch {
    next = "/settings";
  }
  const redirect = (status: string) => {
    const target = new URL(next, origin);
    target.searchParams.set("gmail", status);
    const response = NextResponse.redirect(target);
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", { path: "/api/gmail", maxAge: 0 });
    return response;
  };

  if (!nonce || stateNonce !== nonce) return redirect("state");
  const code = url.searchParams.get("code");
  if (!code) return redirect("denied");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return redirect("sign_in");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || !canWriteCrm((profile as { role?: string }).role)) return redirect("forbidden");

  const tokens = await exchangeGmailAuthCode(code, gmailRedirectUri(origin));
  if (!tokens.ok) return redirect("token");
  const saved = await upsertGmailConnection(supabase, {
    userId,
    email: tokens.email,
    refreshToken: tokens.refreshToken,
  });
  if (saved.error) return redirect("save");
  return redirect("connected");
}
