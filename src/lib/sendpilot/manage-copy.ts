export const SENDPILOT_ADMIN_DENIED = "You are not authorized to manage SendPilot integrations.";
export const LEGACY_PROTECTED_MESSAGE =
  "Legacy production integration. Its existing webhook remains managed separately during migration.";
export const LEGACY_MUTATION_DENIED =
  "The Realynk Main production webhook cannot be activated, disabled, removed, or have credentials rotated from this app.";
export const ACTIVATION_BLOCKED =
  "Activation is not available until this integration meets the readiness requirements.";
export const ACTIVATION_API_KEY_MISSING = "Activation requires a configured API key.";
export const ACTIVATION_WEBHOOK_SECRET_MISSING = "Activation requires a configured webhook signing secret.";
export const ACTIVATION_TRACKING_INVALID = "Activation requires a valid campaign tracking policy.";
export const ACTIVATION_WEBHOOK_URL_UNAVAILABLE = "Activation requires the unique dynamic webhook URL.";
export const ACTIVATION_CRM_PATH_UNAVAILABLE =
  "Activation is not available until the Phase 5 scoped CRM apply path is enabled.";
export const ACTIVATION_ALREADY_ACTIVE = "This integration is already active.";
export const CRM_NOT_ENABLED_MESSAGE = "Setup incomplete — CRM synchronization is not enabled yet.";
export const SELECTED_REQUIRES_CAMPAIGN = "Selected campaigns requires at least one campaign.";
export const ENCRYPTION_NOT_CONFIGURED = "Credential encryption is not configured.";
export const INTEGRATION_NOT_FOUND = "That SendPilot integration was not found.";
export const WEBHOOK_SETUP_MESSAGE =
  "Create a webhook endpoint in SendPilot using this URL. SendPilot will provide a signing secret after the webhook is created.";
export const API_KEY_SAVED_MESSAGE = "API key saved";
export const WEBHOOK_SECRET_SAVED_MESSAGE = "Webhook secret: Configured";
export const TRACKING_ONBOARDING_MESSAGE =
  "New accounts start on All campaigns. Campaign IDs can be learned from verified webhook traffic. Selected-campaign configuration can be completed later once campaigns are known. Campaign names are not invented.";
