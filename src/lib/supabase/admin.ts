import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

export function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

export function createAdminClient() {
  const key = supabaseServiceRoleKey();
  if (!key) {
    throw new Error("A Supabase service role key is required for SendPilot webhook writes.");
  }
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
