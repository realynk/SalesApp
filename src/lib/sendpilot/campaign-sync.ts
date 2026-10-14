export const SENDPILOT_CAMPAIGN_LIST_IN_REPO = false;

export const CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE =
  "Campaign discovery is not available yet. This app only uses SendPilot API paths already implemented in the client, and a campaign-list endpoint is not among them.";

export function planCampaignSync() {
  return {
    ok: false as const,
    reason: "campaign_sync_unavailable" as const,
    message: CAMPAIGN_SYNC_UNAVAILABLE_MESSAGE,
  };
}
