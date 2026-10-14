import type { SendPilotApiProbeResult } from "./client";

export const UNABLE_TO_VERIFY_ACCOUNT = "Unable to verify this SendPilot account.";
export const API_KEY_REJECTED = "SendPilot rejected this API key.";
export const SENDPILOT_API_UNAVAILABLE = "SendPilot API unavailable.";
export const SENDPILOT_API_NOT_CONFIGURED = "SendPilot API is not configured.";
export const WORKSPACE_VERIFY_UNSUPPORTED =
  "SendPilot workspace identity cannot be verified automatically. This app has no workspace or profile endpoint in the current client.";

export type VerifyApiUiResult =
  | { ok: true; workspaceVerified: false; workspaceMessage: string }
  | { ok: false; error: string };

export function apiKeySaveBlockedByProbe(result: SendPilotApiProbeResult): string | null {
  if (result.status === 401 || result.status === 403) return API_KEY_REJECTED;
  return null;
}

export function mapSendPilotApiProbe(result: SendPilotApiProbeResult): VerifyApiUiResult {
  if (result.status === 401 || result.status === 403) {
    return { ok: false, error: API_KEY_REJECTED };
  }
  if (result.accepted) {
    return {
      ok: true,
      workspaceVerified: false,
      workspaceMessage: WORKSPACE_VERIFY_UNSUPPORTED,
    };
  }
  if (result.status === 503) {
    return { ok: false, error: SENDPILOT_API_NOT_CONFIGURED };
  }
  return { ok: false, error: SENDPILOT_API_UNAVAILABLE };
}
