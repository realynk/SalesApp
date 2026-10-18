import { googleClientId, googleClientSecret } from "./config";
import { buildGmailRawMessage } from "./mime";

export type GmailSendInput = {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

async function googleJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const result = await googleJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = typeof result.payload?.access_token === "string" ? result.payload.access_token : "";
  if (!result.ok || !token) {
    return { ok: false as const, error: "Gmail access expired. Connect Gmail again." };
  }
  return { ok: true as const, accessToken: token };
}

export async function sendGmailMessage(accessToken: string, input: GmailSendInput) {
  const raw = buildGmailRawMessage(input);
  const result = await googleJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!result.ok) {
    return { ok: false as const, error: "Gmail could not send the email. Check From, To, and that the account is still connected." };
  }
  return { ok: true as const, id: typeof result.payload?.id === "string" ? result.payload.id : null };
}

export async function exchangeGmailAuthCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const result = await googleJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const refreshToken = typeof result.payload?.refresh_token === "string" ? result.payload.refresh_token : "";
  const accessToken = typeof result.payload?.access_token === "string" ? result.payload.access_token : "";
  if (!result.ok || !accessToken) {
    return { ok: false as const, error: "Google did not return Gmail access. Try connecting again." };
  }
  if (!refreshToken) {
    return { ok: false as const, error: "Google did not return a refresh token. Reconnect and accept every permission prompt." };
  }
  const profile = await googleJson("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const email = typeof profile.payload?.email === "string" ? profile.payload.email : "";
  if (!email) return { ok: false as const, error: "Google did not return the Gmail address." };
  return { ok: true as const, refreshToken, accessToken, email };
}
