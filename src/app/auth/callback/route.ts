import { NextResponse } from "next/server";
import {
  EXECUTIVE_LOGIN_PATH,
  LOGIN_METHOD_COOKIE,
  LOGIN_METHOD_MAGIC,
  callbackAuthParams,
  loginMethodCookieOptions,
} from "@/lib/auth/passwordless";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { code, tokenHash, type, next } = callbackAuthParams(url);
  const fail = () => NextResponse.redirect(new URL(`${EXECUTIVE_LOGIN_PATH}?error=auth`, url.origin));

  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail();
  } else {
    return fail();
  }

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return fail();

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return fail();
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  response.cookies.set(LOGIN_METHOD_COOKIE, LOGIN_METHOD_MAGIC, loginMethodCookieOptions);
  return response;
}
