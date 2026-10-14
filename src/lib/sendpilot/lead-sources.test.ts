import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACCOUNT_FLAGS, accountFlag, accountFlagIconClass, accountFlagLabel } from "../domain.ts";
import { mapSendPilotLeadSources, sendPilotSourceIndicator } from "./lead-sources.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const boardSource = readFileSync(join(root, "components/pipeline-board.tsx"), "utf8");
const flagField = readFileSync(join(root, "components/account-flag-field.tsx"), "utf8");
const dataSource = readFileSync(join(root, "lib/data.ts"), "utf8");
const actionsSource = readFileSync(join(root, "server/actions.ts"), "utf8");
const opportunitiesPage = readFileSync(join(root, "app/(app)/opportunities/page.tsx"), "utf8");
const leadSources = readFileSync(join(root, "lib/sendpilot/lead-sources.ts"), "utf8");

const LEAD_A = "11111111-1111-4111-8111-111111111111";
const LEAD_B = "22222222-2222-4222-8222-222222222222";
const INTEGRATION_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INTEGRATION_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function mappedSources() {
  return mapSendPilotLeadSources({
    identities: [
      { lead_id: LEAD_A, integration_id: INTEGRATION_A },
      { lead_id: LEAD_A, integration_id: INTEGRATION_B },
      { lead_id: LEAD_B, integration_id: INTEGRATION_A },
      { lead_id: null, integration_id: INTEGRATION_A },
    ],
    integrations: [
      { id: INTEGRATION_A, name: "North Account" },
      { id: INTEGRATION_B, name: "South Account" },
    ],
  });
}

test("SendPilot-associated lead gets an SP indicator with the dynamic integration name", () => {
  const sources = mappedSources().get(LEAD_B) ?? [];
  const indicator = sendPilotSourceIndicator(sources);
  assert.equal(indicator.show, true);
  if (!indicator.show) return;
  assert.equal(indicator.label, "SP");
  assert.equal(indicator.title, "SendPilot: North Account");
  assert.match(dataSource, /from\("sendpilot_lead_identities"\)/);
  assert.match(dataSource, /from\("sendpilot_integrations"\)/);
  assert.match(dataSource, /select\("id, name"\)/);
  assert.match(opportunitiesPage, /listSendPilotSourcesByLeadIds/);
  assert.match(boardSource, /SendPilotSourceBadge/);
});

test("no SendPilot association shows no SP indicator", () => {
  const indicator = sendPilotSourceIndicator([]);
  assert.deepEqual(indicator, { show: false });
  assert.match(boardSource, /if \(!indicator\.show\) return null/);
});

test("multiple integrations are not silently reduced to one", () => {
  const sources = mappedSources().get(LEAD_A) ?? [];
  assert.equal(sources.length, 2);
  const indicator = sendPilotSourceIndicator(sources);
  assert.equal(indicator.show, true);
  if (!indicator.show) return;
  assert.equal(indicator.label, "SP +1");
  assert.equal(indicator.count, 2);
  assert.match(indicator.title, /North Account/);
  assert.match(indicator.title, /South Account/);
  assert.equal(indicator.label.includes("SP +"), true);
});

test("existing flag values render the matching visual state and label", () => {
  assert.deepEqual([...ACCOUNT_FLAGS], [
    "Urgent",
    "Follow up",
    "Waiting on client",
    "Waiting on recruitment",
    "At risk",
  ]);
  assert.equal(accountFlag("High"), null);
  assert.equal(accountFlag("Urgent"), "Urgent");
  assert.equal(accountFlagLabel(null), "Flag: None");
  assert.equal(accountFlagLabel("Urgent"), "Flag: Urgent");
  assert.match(accountFlagIconClass("Urgent"), /#b42318/);
  assert.match(accountFlagIconClass(null), /text-muted-foreground/);
  assert.match(flagField, /AccountFlagButton/);
  assert.match(flagField, /accountFlagIconClass\(value\)/);
  assert.match(boardSource, /AccountFlagButton/);
  assert.equal(boardSource.includes("AccountFlagSelect"), false);
  assert.equal(boardSource.includes("No flag"), false);
});

test("clicking the flag uses the existing account flag save path", () => {
  assert.match(boardSource, /persistFlag/);
  assert.match(boardSource, /setAccountFlagFromBoard/);
  assert.match(flagField, /onChange\(flag\)/);
  assert.match(actionsSource, /export async function setAccountFlagFromBoard/);
  assert.match(actionsSource, /writeAccountFlag/);
  assert.match(actionsSource, /from\("leads"\)\.update\(\{ account_flag: flag \}\)/);
  assert.match(flagField, /ACCOUNT_FLAGS\.map/);
});

test("Owner is not rendered on the Journey card, but owner data remains", () => {
  assert.equal(/CardField label="Owner"/.test(boardSource), false);
  assert.match(boardSource, /ownerName: opportunity\.ownerName/);
  assert.match(dataSource, /owner_id/);
  assert.match(dataSource, /ownerName: str\(owner\?\.full_name\)/);
  assert.match(dataSource, /profiles\(id, full_name\)/);
});

test("no hardcoded SendPilot integration IDs or names in Journey UI", () => {
  const sources = [boardSource, flagField, leadSources, opportunitiesPage].join("\n");
  assert.equal(sources.includes("Realynk Main"), false);
  assert.equal(sources.includes("Trey's SendPilot"), false);
  assert.equal(sources.includes("SP1"), false);
  assert.equal(sources.includes("SP2"), false);
  assert.equal(sources.includes("0b77e4e5-be58-41d8-99d0-2e2853559b61"), false);
});
