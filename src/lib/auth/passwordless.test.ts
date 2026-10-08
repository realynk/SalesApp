import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_LOGIN_PATH,
  callbackAuthParams,
  EXECUTIVE_LOGIN_PATH,
  isLoginPath,
  loginPathForMethod,
  LOGIN_METHOD_MAGIC,
  MAGIC_LINK_SENT,
  magicLinkEmailRedirectTo,
  safeNextPath,
} from "./passwordless.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..", "..");
const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
const callback = readFileSync(join(root, "src/app/auth/callback/route.ts"), "utf8");
const proxy = readFileSync(join(root, "src/lib/supabase/proxy.ts"), "utf8");
const adminLogin = readFileSync(join(root, "src/app/login/page.tsx"), "utf8");
const executiveLogin = readFileSync(join(root, "src/app/login/executive/page.tsx"), "utf8");
const authz = readFileSync(join(root, "src/lib/authz.ts"), "utf8");
const session = readFileSync(join(root, "src/server/session.ts"), "utf8");

test("safeNextPath blocks open redirects", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/leads?x=1"), "/leads?x=1");
  assert.equal(safeNextPath("https://evil.example/phish"), "/dashboard");
  assert.equal(safeNextPath("//evil.example"), "/dashboard");
  assert.equal(safeNextPath("\\evil"), "/dashboard");
  assert.equal(safeNextPath(null), "/dashboard");
});

test("magic-link redirect stays on this app callback", () => {
  assert.equal(
    magicLinkEmailRedirectTo("https://preview.example", "/leads"),
    "https://preview.example/auth/callback?next=%2Fleads",
  );
});

test("callback accepts PKCE code or email token_hash", () => {
  const pkce = callbackAuthParams(new URL("https://app.example/auth/callback?code=abc&next=/reporting"));
  assert.equal(pkce.code, "abc");
  assert.equal(pkce.tokenHash, null);
  assert.equal(pkce.next, "/reporting");
  const otp = callbackAuthParams(new URL("https://app.example/auth/callback?token_hash=tok&type=magiclink"));
  assert.equal(otp.tokenHash, "tok");
  assert.equal(otp.type, "magiclink");
  assert.equal(otp.next, "/dashboard");
});

test("expired sessions return to the matching login form", () => {
  assert.equal(loginPathForMethod(LOGIN_METHOD_MAGIC), EXECUTIVE_LOGIN_PATH);
  assert.equal(loginPathForMethod("password"), ADMIN_LOGIN_PATH);
  assert.equal(isLoginPath("/login"), true);
  assert.equal(isLoginPath("/login/executive"), true);
  assert.equal(isLoginPath("/dashboard"), false);
});

test("executive flow hides the password form; admin login keeps it", () => {
  assert.match(executiveLogin, /requestExecutiveMagicLink/);
  assert.equal(executiveLogin.includes('type="password"'), false);
  assert.equal(executiveLogin.includes("name=\"password\""), false);
  assert.match(adminLogin, /signIn/);
  assert.match(adminLogin, /type="password"/);
  assert.equal(adminLogin.includes("requestExecutiveMagicLink"), false);
});

test("magic link does not create users and uses a generic reply", () => {
  assert.match(actions, /signInWithOtp/);
  assert.match(actions, /shouldCreateUser:\s*false/);
  assert.match(actions, /MAGIC_LINK_SENT/);
  assert.match(actions, /requestExecutiveMagicLink/);
  assert.equal(MAGIC_LINK_SENT.includes("authorized"), true);
});

test("callback exchanges a session, requires a profile, and does not weaken writes", () => {
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /verifyOtp/);
  assert.match(callback, /from\("profiles"\)/);
  assert.match(callback, /signOut/);
  assert.match(proxy, /loginPathForMethod/);
  assert.match(proxy, /LOGIN_METHOD_COOKIE/);
  assert.match(session, /loginPathForMethod/);
  assert.match(authz, /role === "sales_lead"/);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /redirect\(loginPathForMethod\(method\)\)/);
});
