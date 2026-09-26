import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/env";

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey());
}
