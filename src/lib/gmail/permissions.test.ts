import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GMAIL_SCOPES } from "./config.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("Gmail OAuth requests only send, openid, and email", () => {
  assert.match(GMAIL_SCOPES, /\bopenid\b/);
  assert.match(GMAIL_SCOPES, /\bemail\b/);
  assert.match(GMAIL_SCOPES, /https:\/\/www\.googleapis\.com\/auth\/gmail\.send/);
  assert.doesNotMatch(GMAIL_SCOPES, /gmail\.settings\.basic/);
  assert.doesNotMatch(GMAIL_SCOPES, /gmail\.readonly/);
  assert.doesNotMatch(GMAIL_SCOPES, /gmail\.modify/);
  assert.doesNotMatch(GMAIL_SCOPES, /mail\.google\.com/);
});

test("Gmail send path does not list send-as aliases", () => {
  const send = readFileSync(join(root, "src/lib/gmail/send.ts"), "utf8");
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const sendFn = actions.slice(actions.indexOf("export async function sendProfileEmailAndRecord"), actions.indexOf("export async function saveBookedSalesCallFromBoard"));
  const statusFn = actions.slice(actions.indexOf("export async function loadGmailStatus"), actions.indexOf("export async function disconnectGmail"));
  assert.doesNotMatch(send, /settings\/sendAs/);
  assert.doesNotMatch(send, /listGmailSendAs/);
  assert.doesNotMatch(actions, /listGmailSendAs/);
  assert.match(sendFn, /From must be the connected Gmail account/);
  assert.match(sendFn, /loaded\.row\.email/);
  assert.doesNotMatch(sendFn, /send-as aliases/);
  assert.doesNotMatch(statusFn, /refreshGmailAccessToken/);
  assert.doesNotMatch(statusFn, /decryptGmailRefreshToken/);
});

test("profile email context is a read of stored names and does not send mail", () => {
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const contextFn = actions.slice(actions.indexOf("export async function loadSalesProfileEmailContext"), actions.indexOf("export async function loadGmailStatus"));
  assert.match(contextFn, /requireUser/);
  assert.match(contextFn, /sendpilot_lead_identities/);
  assert.match(contextFn, /originalLinkedInOutreachFirstName/);
  assert.match(actions, /withProfileEmailSignature\(parsed\.body\)/);
  assert.match(actions, /parseSalesProfileEmailDraft/);
  assert.doesNotMatch(contextFn, /requireWriter/);
  assert.doesNotMatch(contextFn, /sendGmailMessage/);
  assert.doesNotMatch(contextFn, /planSalesProfileFollowUps/);
});

test("From is locked to the connected Gmail account in the review UI", () => {
  const dialog = readFileSync(join(root, "src/components/profile-send-dialog.tsx"), "utf8");
  assert.match(dialog, /readOnly/);
  assert.match(dialog, /aria-readonly/);
  assert.match(dialog, /gmail\?\.email/);
  assert.doesNotMatch(dialog, /fromAddresses/);
  assert.doesNotMatch(dialog, /<select/);
  assert.match(dialog, /Save without sending/);
  assert.match(dialog, /Send email/);
  assert.match(dialog, /Mark as sent outside SalesApp/);
});

test("Gmail tokens stay encrypted with the existing secrets helper", () => {
  const connection = readFileSync(join(root, "src/lib/gmail/connection.ts"), "utf8");
  assert.match(connection, /encryptSecret\(input\.refreshToken\)/);
  assert.match(connection, /decryptSecret\(ciphertext\)/);
  assert.match(connection, /refresh_token_ciphertext/);
  assert.doesNotMatch(connection, /SENDPILOT_API_KEY/);
  assert.doesNotMatch(connection, /SENDPILOT_WEBHOOK_SECRET/);
});
