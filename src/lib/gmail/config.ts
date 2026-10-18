import { publicAppBaseUrl } from "@/lib/env";
import { sendpilotSecretsEncryptionKeyPresent } from "@/lib/sendpilot/secrets";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

export function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}

export function googleClientSecret() {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

export function gmailOAuthConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

export function gmailTokenEncryptionReady() {
  return sendpilotSecretsEncryptionKeyPresent();
}

export function gmailRedirectUri(origin: string) {
  const explicit = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const base = origin || publicAppBaseUrl();
  return `${base.replace(/\/$/, "")}/api/gmail/callback`;
}

export function gmailConnectReadyMessage() {
  if (!gmailOAuthConfigured()) {
    return "Gmail is not connected for this workspace yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then connect your account.";
  }
  if (!gmailTokenEncryptionReady()) {
    return "Gmail tokens cannot be stored until SENDPILOT_SECRETS_ENCRYPTION_KEY is set.";
  }
  return null;
}
