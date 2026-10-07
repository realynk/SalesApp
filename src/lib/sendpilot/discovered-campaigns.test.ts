import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SENDPILOT_CAMPAIGN_LIST_IN_REPO } from "./campaign-sync.ts";
import {
  campaignDisplayName,
  LEGACY_MUTATION_DENIED,
  mapDiscoveredCampaigns,
  planCampaignTrackingRows,
  planTrackingModeChange,
  SELECTED_REQUIRES_CAMPAIGN,
} from "./manage.ts";
import { campaignGate } from "./policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const settingsData = readFileSync(join(root, "lib/sendpilot/settings-data.ts"), "utf8");
const manageUi = readFileSync(join(root, "components/sendpilot-integration-manage.tsx"), "utf8");
const clientSource = readFileSync(join(root, "lib/sendpilot/client.ts"), "utf8");
const applySource = readFileSync(join(root, "lib/sendpilot/apply.ts"), "utf8");
const manageCopy = readFileSync(join(root, "lib/sendpilot/manage.ts"), "utf8");
const actionsSource = readFileSync(join(root, "server/sendpilot-integrations.ts"), "utf8");
const detailPage = readFileSync(join(root, "app/(app)/settings/sendpilot/[id]/page.tsx"), "utf8");
const policySource = readFileSync(join(root, "lib/sendpilot/policy.ts"), "utf8");

const TREY_INTEGRATION = "0b77e4e5-be58-41d8-99d0-2e2853559b61";
const OTHER_INTEGRATION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DISCOVERED_ID = "cmuvjginz0r7f1m010ynt6n0h";
const OTHER_CAMPAIGN = "camp_other_account";

test("A. discovered sendpilot_campaigns rows load for the correct integration", () => {
  const mapped = mapDiscoveredCampaigns({
    integrationId: TREY_INTEGRATION,
    campaigns: [
      {
        integration_id: TREY_INTEGRATION,
        sendpilot_campaign_id: DISCOVERED_ID,
        name: null,
        remote_status: null,
        last_seen_at: "2026-10-07T00:00:00.000Z",
      },
    ],
    tracking: [],
    trackingMode: "all",
  });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]?.sendpilotCampaignId, DISCOVERED_ID);
  assert.match(settingsData, /from\("sendpilot_campaigns"\)/);
  assert.match(settingsData, /mapDiscoveredCampaigns/);
  assert.equal(settingsData.includes('.order("name"'), false);
  assert.match(settingsData, /order\("sendpilot_campaign_id"/);
});

test("B. campaign with name=null still appears using ID fallback", () => {
  const mapped = mapDiscoveredCampaigns({
    integrationId: TREY_INTEGRATION,
    campaigns: [
      {
        integration_id: TREY_INTEGRATION,
        sendpilot_campaign_id: DISCOVERED_ID,
        name: null,
        remote_status: null,
        last_seen_at: null,
      },
    ],
    tracking: [],
    trackingMode: "all",
  });
  assert.equal(mapped[0]?.name, null);
  assert.equal(campaignDisplayName(mapped[0]!), `Campaign ${DISCOVERED_ID}`);
  assert.equal(campaignDisplayName({ name: "Named campaign", sendpilotCampaignId: DISCOVERED_ID }), "Named campaign");
  assert.match(manageUi, /campaignDisplayName\(campaign\)/);
  assert.equal(manageUi.includes("Realynk | SDR Offer | October 5"), false);
  assert.equal(settingsData.includes("Realynk | SDR Offer | October 5"), false);
  assert.equal(manageCopy.includes("Realynk | SDR Offer | October 5"), false);
});

test("C. campaign belonging to another integration does not appear", () => {
  const mapped = mapDiscoveredCampaigns({
    integrationId: TREY_INTEGRATION,
    campaigns: [
      {
        integration_id: OTHER_INTEGRATION,
        sendpilot_campaign_id: OTHER_CAMPAIGN,
        name: "Other account campaign",
        remote_status: null,
        last_seen_at: null,
      },
      {
        integration_id: TREY_INTEGRATION,
        sendpilot_campaign_id: DISCOVERED_ID,
        name: null,
        remote_status: null,
        last_seen_at: null,
      },
    ],
    tracking: [],
    trackingMode: "all",
  });
  assert.deepEqual(
    mapped.map((row) => row.sendpilotCampaignId),
    [DISCOVERED_ID],
  );
});

test("D. selected campaigns requires at least one campaign", () => {
  const planned = planTrackingModeChange({
    legacyEnv: false,
    mode: "selected",
    selectedCampaignIds: [],
  });
  assert.equal("error" in planned, true);
  if ("error" in planned) assert.equal(planned.error, SELECTED_REQUIRES_CAMPAIGN);
  const rows = planCampaignTrackingRows({
    integrationId: TREY_INTEGRATION,
    mode: "selected",
    selectedCampaignIds: [],
    existing: [],
    nowIso: "2026-10-07T00:00:00.000Z",
  });
  assert.equal("error" in rows, true);
});

test("E/F/G. saving selected mode upserts integration-scoped tracked true/false", () => {
  const planned = planCampaignTrackingRows({
    integrationId: TREY_INTEGRATION,
    mode: "selected",
    selectedCampaignIds: [DISCOVERED_ID],
    existing: [
      { sendpilotCampaignId: DISCOVERED_ID, tracked: false },
      { sendpilotCampaignId: "camp_unselected", tracked: true },
    ],
    nowIso: "2026-10-07T00:00:00.000Z",
  });
  assert.equal("error" in planned, false);
  if ("error" in planned) return;
  for (const row of planned.upserts) {
    assert.equal(row.integration_id, TREY_INTEGRATION);
  }
  const byId = Object.fromEntries(planned.upserts.map((row) => [row.sendpilot_campaign_id, row]));
  assert.equal(byId[DISCOVERED_ID]?.tracked, true);
  assert.equal(byId[DISCOVERED_ID]?.untracked_at, null);
  assert.equal(byId.camp_unselected?.tracked, false);
  assert.equal(byId.camp_unselected?.untracked_at, "2026-10-07T00:00:00.000Z");
  assert.match(actionsSource, /planCampaignTrackingRows/);
  assert.match(actionsSource, /tracking_mode: planned\.mode/);
  assert.match(actionsSource, /from\("sendpilot_campaign_tracking"\)\.upsert/);
  assert.match(actionsSource, /action: "tracking_mode_changed"/);
  assert.match(actionsSource, /action: "campaign_tracking_changed"/);
});

test("H. webhook selected-mode gate accepts a tracked campaign", () => {
  assert.deepEqual(
    campaignGate({
      legacyEnv: false,
      trackingMode: "selected",
      campaignId: DISCOVERED_ID,
      tracked: true,
    }),
    { allow: true },
  );
});

test("I. webhook selected-mode gate ignores an untracked campaign", () => {
  assert.deepEqual(
    campaignGate({
      legacyEnv: false,
      trackingMode: "selected",
      campaignId: DISCOVERED_ID,
      tracked: false,
    }),
    { allow: false, reason: "campaign_not_tracked" },
  );
  assert.match(policySource, /mode === "selected" && !input\.tracked/);
  assert.match(applySource, /campaignGate\(/);
});

test("J. no campaign-list API endpoint is introduced", () => {
  assert.equal(SENDPILOT_CAMPAIGN_LIST_IN_REPO, false);
  assert.equal(clientSource.includes("/campaigns"), false);
  assert.equal(applySource.includes("GET /campaigns"), false);
  assert.match(applySource, /rememberCampaign\(/);
});

test("K. Realynk Main behavior remains unchanged", () => {
  assert.deepEqual(
    campaignGate({ legacyEnv: true, trackingMode: "selected", campaignId: null, tracked: false }),
    { allow: true },
  );
  assert.equal(
    "error" in planTrackingModeChange({ legacyEnv: true, mode: "selected", selectedCampaignIds: [DISCOVERED_ID] }),
    true,
  );
  const denied = planTrackingModeChange({
    legacyEnv: true,
    mode: "all",
    selectedCampaignIds: [],
  });
  assert.equal("error" in denied && denied.error, LEGACY_MUTATION_DENIED);
  assert.match(detailPage, /existing Realynk Main webhook/);
  assert.match(manageUi, /detail\.legacyEnv/);
});

test("L. discovered campaign mapping does not invent names or require tracking rows", () => {
  const mapped = mapDiscoveredCampaigns({
    integrationId: TREY_INTEGRATION,
    campaigns: [
      {
        integration_id: TREY_INTEGRATION,
        sendpilot_campaign_id: DISCOVERED_ID,
        name: "",
        remote_status: null,
        last_seen_at: null,
      },
    ],
    tracking: [],
    trackingMode: "selected",
  });
  assert.equal(mapped[0]?.name, null);
  assert.equal(mapped[0]?.tracked, false);
  assert.equal(applySource.includes("Realynk | SDR Offer | October 5"), false);
  assert.equal(/name:\s*ids\.campaignName/.test(applySource), false);
});
