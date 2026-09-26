export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey());
}

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

export function supabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

export function sendPilotIntegrationStatus() {
  const hasCredentials = Boolean(process.env.SENDPILOT_API_BASE_URL || process.env.SENDPILOT_API_KEY || process.env.SENDPILOT_WEBHOOK_SECRET);
  return {
    fileImportReady: true,
    credentialsPresent: hasCredentials,
    apiEnabled: false,
    message: hasCredentials
      ? "SendPilot credentials are present, but Realynk does not call undocumented SendPilot endpoints. CSV, XLS, and XLSX import remains the sync path until an API contract is confirmed."
      : "SendPilot API is not configured. Import a CSV, XLS, or XLSX export. No SendPilot endpoint is called.",
  };
}
