/**
 * Google Meet recording + AI notes — feasibility (Phase 5, not enabled).
 *
 * SalesApp cannot start a Google Meet recording. Recording depends on the
 * Workspace edition, admin policy, host consent, and participant notice.
 *
 * Retrieval options Google documents today:
 * - Drive API: recordings that the host saved to Drive, after OAuth with
 *   drive.readonly (or a narrower recorded-file scope when available).
 * - Meet REST API / Admin reports: conference metadata, not a guaranteed
 *   recording-download API for every Workspace SKU.
 *
 * Required before implementation:
 * - Google Cloud project + OAuth consent (internal Workspace).
 * - Admin approval for Drive/Meet scopes.
 * - Mapping from a sales call to a Meet conference / Drive file.
 * - Storage policy for recording URLs and generated notes (RLS, no service
 *   role in the browser).
 *
 * This module only classifies local preconditions. It does not call Google
 * and does not generate invented meeting content.
 */

export type MeetingNotesRequest = {
  userRequested: boolean;
  recordingAvailable: boolean;
  permissionGranted: boolean;
  processingFailed?: boolean;
};

export type MeetingNotesResult =
  | { ok: true; internalNotes: string; clientSummary: string }
  | { ok: false; error: string; allowManual: true };

export const GOOGLE_MEET_INTEGRATION_READY = false;

export function startMeetingNotes(input: MeetingNotesRequest): MeetingNotesResult {
  if (!input.userRequested) {
    return { ok: false, error: "Meeting notes are generated only when you ask.", allowManual: true };
  }
  if (!input.permissionGranted) {
    return { ok: false, error: "Google recording access is not authorized for this workspace.", allowManual: true };
  }
  if (!input.recordingAvailable) {
    return { ok: false, error: "No Google Meet recording is available for this sales call.", allowManual: true };
  }
  if (input.processingFailed || !GOOGLE_MEET_INTEGRATION_READY) {
    return {
      ok: false,
      error: "AI meeting notes could not be generated. Add the notes manually.",
      allowManual: true,
    };
  }
  return { ok: false, error: "AI meeting notes are not connected yet. Add notes manually.", allowManual: true };
}
