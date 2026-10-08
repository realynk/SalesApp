import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_METHOD_COOKIE, loginPathForMethod } from "@/lib/auth/passwordless";
import { authorizeCrmWrite, CRM_WRITE_DENIED, type UserRole } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
};

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    const method = (await cookies()).get(LOGIN_METHOD_COOKIE)?.value;
    redirect(loginPathForMethod(method));
  }
  const { data: profile } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
  return { supabase, userId, profile: (profile as Profile | null) ?? null };
});

export const requireWriter = cache(async () => {
  const session = await requireUser();
  const auth = authorizeCrmWrite(session.profile?.role);
  if (!auth.ok) {
    redirect(`/dashboard?notice=${encodeURIComponent(CRM_WRITE_DENIED)}`);
  }
  return session;
});
