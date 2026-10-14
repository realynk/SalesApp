export const ADMIN_LOGIN_PATH = "/login";
export const EXECUTIVE_LOGIN_PATH = "/login/executive";
export const LOGIN_METHOD_COOKIE = "salesapp_login_method";
export const LOGIN_METHOD_MAGIC = "magic_link";
export const LOGIN_METHOD_PASSWORD = "password";
export const LOGIN_METHOD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export const MAGIC_LINK_SENT =
  "If this email is authorized, a sign-in link is on its way. The link expires; use it from this device when you can.";

export function safeNextPath(next: string | null | undefined) {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}

export function loginPathForMethod(method: string | null | undefined) {
  return method === LOGIN_METHOD_MAGIC ? EXECUTIVE_LOGIN_PATH : ADMIN_LOGIN_PATH;
}

export function isLoginPath(pathname: string) {
  return pathname === ADMIN_LOGIN_PATH || pathname === EXECUTIVE_LOGIN_PATH;
}

export function magicLinkEmailRedirectTo(origin: string, next = "/dashboard") {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}

export function parseEmailOtpType(value: string | null | undefined): EmailOtpType {
  if (value && (EMAIL_OTP_TYPES as readonly string[]).includes(value)) return value as EmailOtpType;
  return "email";
}

export function callbackAuthParams(url: URL) {
  return {
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: parseEmailOtpType(url.searchParams.get("type")),
    next: safeNextPath(url.searchParams.get("next")),
  };
}

export const loginMethodCookieOptions = {
  path: "/",
  maxAge: LOGIN_METHOD_COOKIE_MAX_AGE,
  sameSite: "lax" as const,
  httpOnly: true,
};
