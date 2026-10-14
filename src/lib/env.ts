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

export function publicAppBaseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (production) {
    return production.startsWith("http") ? production.replace(/\/$/, "") : `https://${production.replace(/\/$/, "")}`;
  }
  return "";
}

export function sendPilotIntegrationStatus() {
  const apiEnabled = Boolean(process.env.SENDPILOT_API_BASE_URL && process.env.SENDPILOT_API_KEY);
  const webhookConfigured = Boolean(process.env.SENDPILOT_WEBHOOK_SECRET);
  const hasCredentials = apiEnabled || webhookConfigured;
  return {
    fileImportReady: true,
    credentialsPresent: hasCredentials,
    apiEnabled,
    webhookConfigured,
    message: webhookConfigured
      ? apiEnabled
        ? "SendPilot webhooks and the server-side API are configured. CSV, XLS, and XLSX import remains available as a manual fallback. SendPilot tags stay separate from the client journey."
        : "SendPilot webhook verification is configured. Set SENDPILOT_API_BASE_URL and SENDPILOT_API_KEY so the app can fetch a lead when a webhook payload is incomplete. CSV, XLS, and XLSX import remains available."
      : apiEnabled
        ? "SendPilot API credentials are present. Add SENDPILOT_WEBHOOK_SECRET from SendPilot → Integrations → Webhooks, then subscribe to this app's webhook URL. CSV, XLS, and XLSX import remains available."
        : "SendPilot live sync is not fully configured. Import a CSV, XLS, or XLSX export, or add the SendPilot API key, base URL, and webhook secret.",
  };
}
