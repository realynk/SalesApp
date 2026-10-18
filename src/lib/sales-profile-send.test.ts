import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeSalesProfileEmailDraft,
  isSalesProfileEmailDraft,
  parseSalesProfileEmailDraft,
  shouldPlanSalesProfileFollowUps,
} from "./sales-profile-send.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("draft encoding round-trips and is not treated as sent", () => {
  const encoded = encodeSalesProfileEmailDraft({
    from: "joan@realynk.com",
    to: "wes@client.com",
    cc: "lead@client.com",
    subject: "Profiles",
    body: "Hi William,\n\nHere are the profiles.",
    notes: "Waiting on approval",
  });
  assert.equal(isSalesProfileEmailDraft(encoded), true);
  const parsed = parseSalesProfileEmailDraft(encoded);
  assert.equal(parsed?.to, "wes@client.com");
  assert.equal(parsed?.cc, "lead@client.com");
  assert.match(parsed?.body ?? "", /Here are the profiles/);
  assert.equal(parsed?.notes, "Waiting on approval");
});

test("follow-ups are planned only after an actual send", () => {
  assert.equal(shouldPlanSalesProfileFollowUps("draft", false), false);
  assert.equal(shouldPlanSalesProfileFollowUps("gmail", false), true);
  assert.equal(shouldPlanSalesProfileFollowUps("manual", false), true);
  assert.equal(shouldPlanSalesProfileFollowUps("gmail", true), false);
  assert.equal(shouldPlanSalesProfileFollowUps("manual", true), false);
});

test("save without sending does not record a send or schedule follow-ups", () => {
  const actions = readFileSync(join(root, "src/server/actions.ts"), "utf8");
  const dialog = readFileSync(join(root, "src/components/profile-send-dialog.tsx"), "utf8");
  const draftFn = actions.slice(actions.indexOf("export async function saveSalesProfileEmailDraft"), actions.indexOf("export async function markSalesProfileSentFromBoard"));
  const markFn = actions.slice(actions.indexOf("export async function markSalesProfileSentFromBoard"), actions.indexOf("export type GmailStatus"));
  const candidateFn = actions.slice(actions.indexOf("export async function recordCandidateProfilesSentFromBoard"), actions.indexOf("export async function saveInterviewFromBoard"));
  assert.match(draftFn, /Draft saved\. Email not sent/);
  assert.doesNotMatch(draftFn, /planSalesProfileFollowUps/);
  assert.doesNotMatch(draftFn, /type: "profile_sent"/);
  assert.match(markFn, /planSalesProfileFollowUps/);
  assert.match(markFn, /alreadySent/);
  assert.match(markFn, /manual_sent_confirm/);
  assert.match(markFn, /outside/);
  assert.match(dialog, /Save without sending/);
  assert.match(dialog, /Send email/);
  assert.match(dialog, /Mark as sent outside SalesApp/);
  assert.match(dialog, /I sent this email outside SalesApp/);
  assert.match(candidateFn, /planCandidateProfileFollowUp/);
  assert.doesNotMatch(candidateFn, /planSalesProfileFollowUps/);
  const contextFn = actions.slice(actions.indexOf("export async function loadSalesProfileEmailContext"), actions.indexOf("export async function loadGmailStatus"));
  assert.doesNotMatch(contextFn, /planSalesProfileFollowUps/);
  assert.doesNotMatch(contextFn, /type: "profile_sent"/);
  assert.match(dialog, /facts\.savedBody \|\| template\.body/);
  assert.match(actions, /withProfileEmailSignature/);
});
