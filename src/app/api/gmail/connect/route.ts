import { NextResponse } from "next/server";
import { canWriteCrm } from "@/lib/authz";
import { appOrigin } from "@/lib/auth/origin";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_SCOPES,
  gmailConnectReadyMessage,
  gmailOAuthConfigured,
  gmailRedirectUri,
  googleClientId,
} from "@/lib/gmail/config";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null, origin: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/settings";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return "/settings";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/settings";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = (await appOrigin()) || url.origin;
  const next = safeNext(url.searchParams.get("next"), origin);
  const fail = (reason: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}gmail=${encodeURIComponent(reason)}`, origin));

  const ready = gmailConnectReadyMessage();
  if (ready || !gmailOAuthConfigured()) return fail("not_configured");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return fail("sign_in");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || !canWriteCrm((profile as { role?: string }).role)) return fail("forbidden");

  const nonce = crypto.randomUUID();
  const state = `${nonce}.${Buffer.from(next).toString("base64url")}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", googleClientId());
  auth.searchParams.set("redirect_uri", gmailRedirectUri(origin));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", GMAIL_SCOPES);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);

  const response = NextResponse.redirect(auth);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}
