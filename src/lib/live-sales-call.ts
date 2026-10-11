export const CANDIDATE_INTERVIEW_MODE = "online";

export const INTERVIEW_AVAILABILITY_LABEL = "Candidate Interview Availability";

export const INTERVIEW_AVAILABILITY_HINT =
  "Preferred dates, times, and timezone for interviewing VA candidates. Interviews are online by default.";

const AVAILABILITY_HEADING = `${INTERVIEW_AVAILABILITY_LABEL}:`;

export function splitLiveSalesCallNotes(raw: string | null | undefined) {
  const text = String(raw ?? "").replace(/\s+$/g, "").trim();
  if (!text) return { notes: "", interviewAvailability: "" };
  const match = text.match(/^Candidate Interview Availability:\s*\n?([\s\S]*?)(?:\n\n|$)/i);
  if (!match) return { notes: text, interviewAvailability: "" };
  return {
    interviewAvailability: match[1].trim(),
    notes: text.slice(match[0].length).trim(),
  };
}

export function joinLiveSalesCallNotes(notes: string | null | undefined, interviewAvailability: string | null | undefined) {
  const cleanNotes = splitLiveSalesCallNotes(notes).notes;
  const availability = String(interviewAvailability ?? "").replace(/\s+/g, " ").trim();
  if (!availability) return cleanNotes;
  const block = `${AVAILABILITY_HEADING}\n${availability}`;
  return cleanNotes ? `${block}\n\n${cleanNotes}` : block;
}

export function liveSalesCallFieldLabels() {
  return {
    interviewAvailability: INTERVIEW_AVAILABILITY_LABEL,
    interviewPreference: null,
    interviewMode: CANDIDATE_INTERVIEW_MODE,
  };
}
