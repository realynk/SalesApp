import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: "sales_lead" | "recruiter" | "member";
};

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
  return { supabase, userId, profile: (profile as Profile | null) ?? null };
});
