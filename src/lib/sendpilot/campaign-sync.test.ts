import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE, planCampaignSync, SENDPILOT_CAMPAIGN_LIST_IN_REPO } from "./campaign-sync.ts";

test("campaign list sync is pending because no campaign-list path exists in the client", () => {
  const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client.ts"), "utf8");
  assert.equal(SENDPILOT_CAMPAIGN_LIST_IN_REPO, false);
  assert.equal(client.includes("/campaigns"), false);
  assert.match(client, /\/leads\//);
  const planned = planCampaignSync();
  assert.equal(planned.ok, false);
  assert.equal(planned.reason, "campaign_sync_unavailable");
  assert.equal(planned.message, CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE);
});
