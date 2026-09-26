export function sendpilotApiKey() {
  return process.env.SENDPILOT_API_KEY?.trim() || "";
}

export function sendpilotApiBaseUrl() {
  return (process.env.SENDPILOT_API_BASE_URL || "").trim().replace(/\/$/, "");
}

export function sendpilotWebhookSecret() {
  return process.env.SENDPILOT_WEBHOOK_SECRET?.trim() || "";
}

export function isSendPilotApiConfigured() {
  return Boolean(sendpilotApiBaseUrl() && sendpilotApiKey());
}
