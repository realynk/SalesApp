export const CANDIDATE_INTERVIEW_MODE = "online";

export const INTERVIEW_AVAILABILITY_LABEL = "Candidate Interview Availability";

export const INTERVIEW_AVAILABILITY_HINT =
  "Preferred dates, times, and timezone for interviewing VA candidates. Interviews are online by default.";

const AVAILABILITY_HEADING = `${INTERVIEW_AVAILABILITY_LABEL}:`;

export type LiveSalesCallStatus = "Draft" | "Scheduled" | "Complete" | "Cancelled";

export type LiveSalesCallValues = {
  status: LiveSalesCallStatus | string;
  callOn: string;
  role: string;
  headcount: string;
  responsibilities: string;
  skills: string;
  schedule: string;
  timezone: string;
  workArrangement: string;
  budget: string;
  billingRate: string;
  experience: string;
  special: string;
  startDate: string;
  currentStaffing: string;
  reasonForHiring: string;
  painPoint: string;
  urgency: string;
  dealBreakers: string;
  interviewAvailability: string;
  notes: string;
};

export const LIVE_SALES_CALL_FIELDS: Array<{
  key: keyof LiveSalesCallValues;
  name: string;
  label: string;
  kind: "text" | "textarea" | "number" | "date";
}> = [
  { key: "role", name: "preferred_virtual_staff", label: "VA role", kind: "text" },
  { key: "headcount", name: "headcount_requirement", label: "Number of VAs", kind: "number" },
  { key: "responsibilities", name: "tasks", label: "Responsibilities", kind: "textarea" },
  { key: "skills", name: "tools", label: "Required skills", kind: "textarea" },
  { key: "schedule", name: "schedule", label: "Work schedule", kind: "text" },
  { key: "timezone", name: "timezone", label: "Work time zone", kind: "text" },
  { key: "workArrangement", name: "work_arrangement", label: "Work arrangement", kind: "text" },
  { key: "budget", name: "budget", label: "Budget or approved rate", kind: "text" },
  { key: "billingRate", name: "client_billing_rate", label: "Client billing rate", kind: "number" },
  { key: "experience", name: "ideal_candidate", label: "Preferred experience", kind: "textarea" },
  { key: "special", name: "special_requirements", label: "Special requirements", kind: "textarea" },
  { key: "startDate", name: "start_date_target", label: "Target start date", kind: "date" },
  { key: "currentStaffing", name: "current_staffing", label: "Current staffing", kind: "text" },
  { key: "reasonForHiring", name: "reason_for_hiring", label: "Reason for hiring", kind: "textarea" },
  { key: "painPoint", name: "main_pain_point", label: "Main pain point", kind: "textarea" },
  { key: "urgency", name: "urgency", label: "Urgency", kind: "text" },
  { key: "dealBreakers", name: "deal_breakers", label: "Deal breakers", kind: "textarea" },
  { key: "interviewAvailability", name: "interview_availability", label: INTERVIEW_AVAILABILITY_LABEL, kind: "textarea" },
  { key: "notes", name: "notes", label: "Call notes", kind: "textarea" },
];

export function emptyLiveSalesCallValues(): LiveSalesCallValues {
  return {
    status: "Draft",
    callOn: "",
    role: "",
    headcount: "",
    responsibilities: "",
    skills: "",
    schedule: "",
    timezone: "",
    workArrangement: "",
    budget: "",
    billingRate: "",
    experience: "",
    special: "",
    startDate: "",
    currentStaffing: "",
    reasonForHiring: "",
    painPoint: "",
    urgency: "",
    dealBreakers: "",
    interviewAvailability: "",
    notes: "",
  };
}

function asText(value: unknown) {
  if (value == null) return "";
  return String(value);
}

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

export function liveSalesCallValuesFromRow(row: Record<string, unknown> | null | undefined): LiveSalesCallValues {
  const values = emptyLiveSalesCallValues();
  if (!row) return values;
  const split = splitLiveSalesCallNotes(asText(row.notes));
  values.status = asText(row.status) || "Draft";
  values.callOn = asText(row.call_on);
  values.role = asText(row.preferred_virtual_staff);
  values.headcount = asText(row.headcount_requirement);
  values.responsibilities = asText(row.tasks);
  values.skills = asText(row.tools);
  values.schedule = asText(row.schedule);
  values.timezone = asText(row.timezone);
  values.workArrangement = asText(row.work_arrangement);
  values.budget = asText(row.budget);
  values.billingRate = asText(row.client_billing_rate);
  values.experience = asText(row.ideal_candidate);
  values.special = asText(row.special_requirements);
  values.startDate = asText(row.start_date_target);
  values.currentStaffing = asText(row.current_staffing);
  values.reasonForHiring = asText(row.reason_for_hiring);
  values.painPoint = asText(row.main_pain_point);
  values.urgency = asText(row.urgency);
  values.dealBreakers = asText(row.deal_breakers);
  values.interviewAvailability = split.interviewAvailability;
  values.notes = split.notes;
  return values;
}

export function draftStatusForLiveSalesCall(existingStatus?: string | null): Exclude<LiveSalesCallStatus, "Cancelled"> {
  if (existingStatus === "Complete") return "Complete";
  if (existingStatus === "Scheduled") return "Scheduled";
  return "Draft";
}

export function liveSalesCallIsComplete(status?: string | null) {
  return status === "Complete";
}

export function liveSalesCallFieldLabels() {
  return {
    interviewAvailability: INTERVIEW_AVAILABILITY_LABEL,
    interviewPreference: null,
    interviewMode: CANDIDATE_INTERVIEW_MODE,
  };
}
