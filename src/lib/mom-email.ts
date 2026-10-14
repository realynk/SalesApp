import type { LiveSalesCallValues } from "@/lib/live-sales-call";
import { addCalendarDays, weekdayUtc } from "@/lib/workflow-dates";

export const MOM_ENGAGEMENT_TERMS = [
  "First week at no cost",
  "Month-to-month agreement",
  "Two weeks' notice for service termination",
  "No additional onboarding fees or hidden charges",
  "Staff replacement at no additional cost",
] as const;

export const MOM_RECRUITMENT_TIMELINE =
  "Approximately 5 business days once requirements are finalized.";

export const MOM_DEFAULT_REPORTING =
  "Daily activity updates, including calling activities and appointment-setting results.";

export type MomFacts = {
  contactName: string;
  companyName: string;
  industry?: string | null;
  role?: string | null;
  tasks?: string | null;
  headcount?: string | number | null;
  workArrangement?: string | null;
  rate?: string | number | null;
  budget?: string | null;
  schedule?: string | null;
  timezone?: string | null;
  tools?: string | null;
  reporting?: string | null;
  startDate?: string | null;
  notes?: string | null;
  interviewAvailability?: string | null;
  callOn?: string | null;
  supportFocus?: string | null;
  nextSteps?: string[] | null;
};

export type MomFill = Partial<{
  industry: string;
  role: string;
  tasks: string[];
  staffingPlan: string;
  rate: string;
  monthlyCost: string;
  schedule: string[];
  tools: string[];
  reporting: string;
  startDate: string;
  nextSteps: string[];
  supportFocus: string;
}>;

export function firstNameFromContact(name: string) {
  const token = name.trim().split(/\s+/)[0] ?? "";
  return token || "there";
}

export function nextFridayAfter(iso: string) {
  let cursor = addCalendarDays(iso.slice(0, 10), 1);
  for (let i = 0; i < 8; i += 1) {
    if (weekdayUtc(cursor) === 5) return cursor;
    cursor = addCalendarDays(cursor, 1);
  }
  return cursor;
}

export function formatMomDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function splitMomLines(value: string | null | undefined) {
  if (!value?.trim()) return [];
  return value
    .split(/\n+|;\s+|(?<=\.)\s+(?=[A-Z])/)
    .map((line) => line.replace(/^[-•*\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

function asText(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value).trim();
}

export function formatHourlyRate(raw: string | number | null | undefined) {
  const text = asText(raw);
  if (!text) return "";
  const amount = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return text;
  const money = `$${amount.toFixed(2)}`;
  if (/hour|\/hr|hr\b/i.test(text)) return text.includes("$") ? text : `${money}/hour`;
  return `${money}/hour`;
}

export function hoursPerMonthFromSchedule(schedule: string | null | undefined) {
  const text = asText(schedule);
  if (!text) return null;
  const week = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:\/|per)\s*week/i);
  if (week) return Math.round(Number(week[1]) * 4);
  const month = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:\/|per)\s*month/i);
  if (month) return Math.round(Number(month[1]));
  if (/part[-\s]?time/i.test(text) || /\b20\b/.test(text)) return 80;
  return null;
}

export function estimatedMonthlyCost(rate: string | number | null | undefined, schedule: string | null | undefined) {
  const amount = Number.parseFloat(asText(rate).replace(/[^0-9.]/g, ""));
  const hours = hoursPerMonthFromSchedule(schedule);
  if (!Number.isFinite(amount) || amount <= 0 || !hours) return "";
  const total = amount * hours;
  return `$${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${hours} hours/month)`;
}

function staffingPlan(facts: MomFacts, fill?: MomFill | null) {
  if (fill?.staffingPlan?.trim()) return fill.staffingPlan.trim();
  const headcount = asText(facts.headcount);
  const arrangement = asText(facts.workArrangement);
  const role = asText(facts.role);
  const parts = [arrangement, headcount && role ? `${headcount} ${role}${Number(headcount) === 1 ? "" : "s"}` : headcount, !headcount ? role : ""]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" · ");
}

function supportFocus(facts: MomFacts, fill?: MomFill | null) {
  if (fill?.supportFocus?.trim()) return fill.supportFocus.trim();
  if (facts.supportFocus?.trim()) return facts.supportFocus.trim();
  const role = asText(facts.role).toLowerCase();
  if (/sdr|appointment|outbound|sales/.test(role)) return "your outbound sales efforts";
  if (/va|assistant|admin/.test(role)) return "your day-to-day operations";
  return "your team";
}

export function momFactsFromLiveCall(
  values: LiveSalesCallValues,
  input: { contactName: string; companyName: string; industry?: string | null },
): MomFacts {
  return {
    contactName: input.contactName,
    companyName: input.companyName,
    industry: input.industry,
    role: values.role,
    tasks: values.responsibilities,
    headcount: values.headcount,
    workArrangement: values.workArrangement,
    rate: values.billingRate || values.budget,
    budget: values.budget,
    schedule: values.schedule,
    timezone: values.timezone,
    tools: values.skills,
    startDate: values.startDate,
    notes: values.notes,
    interviewAvailability: values.interviewAvailability,
    callOn: values.callOn,
  };
}

export function mergeMomFill(facts: MomFacts, fill?: MomFill | null): MomFacts {
  if (!fill) return facts;
  return {
    ...facts,
    industry: asText(facts.industry) || fill.industry,
    role: asText(facts.role) || fill.role,
    tasks: asText(facts.tasks) || fill.tasks?.join("\n"),
    rate: asText(facts.rate) || fill.rate,
    schedule: asText(facts.schedule) || fill.schedule?.join("\n"),
    tools: asText(facts.tools) || fill.tools?.join("\n"),
    reporting: asText(facts.reporting) || fill.reporting,
    startDate: asText(facts.startDate) || fill.startDate,
    supportFocus: asText(facts.supportFocus) || fill.supportFocus,
    nextSteps: facts.nextSteps?.length ? facts.nextSteps : fill.nextSteps,
  };
}

function labeled(label: string, value: string) {
  return `${label}: ${value}`;
}

export function buildMomEmail(facts: MomFacts, fill?: MomFill | null) {
  const merged = mergeMomFill(facts, fill);
  const firstName = firstNameFromContact(merged.contactName);
  const company = asText(merged.companyName) || "your company";
  const role = asText(merged.role) || "virtual staff";
  const tasks = fill?.tasks?.length ? fill.tasks : splitMomLines(merged.tasks);
  const tools = fill?.tools?.length ? fill.tools : splitMomLines(merged.tools);
  const scheduleLines = fill?.schedule?.length ? fill.schedule : splitMomLines([merged.schedule, merged.timezone].filter(Boolean).join("\n"));
  const rate = formatHourlyRate(merged.rate) || asText(fill?.rate);
  const monthly = fill?.monthlyCost?.trim() || estimatedMonthlyCost(merged.rate, merged.schedule);
  const staffing = staffingPlan(merged, fill);
  const reporting = asText(merged.reporting) || fill?.reporting?.trim() || MOM_DEFAULT_REPORTING;
  const start = asText(merged.startDate) || fill?.startDate?.trim() || "To be determined, pending internal discussion and approval.";
  const callOn = asText(merged.callOn);
  const decisionBy = callOn ? formatMomDate(nextFridayAfter(callOn)) : null;
  const nextSteps = (merged.nextSteps?.filter(Boolean) ?? []).length
    ? merged.nextSteps!.filter(Boolean)
    : [
        `${firstName} to provide feedback or a decision${decisionBy ? ` by ${decisionBy}` : ""}.`,
        `Realynk Assistants to prepare suitable ${role} candidates upon confirmation.`,
        asText(merged.interviewAvailability)
          ? `Candidate interviews: ${asText(merged.interviewAvailability)} (online by default).`
          : "",
      ].filter(Boolean);

  const lines: string[] = [
    `Hi ${firstName},`,
    "",
    `Thank you for taking the time to meet with us today. It was a pleasure learning more about ${company} and discussing how Realynk Assistants can support ${supportFocus(merged, fill)}.`,
    "",
    "Below is a summary of our discussion for your reference.",
    "",
    labeled("Company", company),
  ];
  if (asText(merged.industry)) lines.push(labeled("Industry", asText(merged.industry)));
  lines.push(labeled("Preferred Virtual Staff", role));
  lines.push("List of Tasks:");
  if (tasks.length) lines.push(...tasks.map((task) => (task.endsWith(".") ? task : `${task}.`)));
  else lines.push("To be confirmed from the sales call.");
  lines.push("");
  if (staffing) lines.push(labeled("Proposed Staffing Plan", staffing));
  if (rate) {
    const perRole = /sdr|va|assistant|setter/i.test(role) ? ` per ${role.replace(/s$/, "")}` : "";
    lines.push(labeled("Rate", `${rate}${perRole}`));
  }
  if (monthly) lines.push(labeled("Estimated Monthly Cost", monthly));
  lines.push("Proposed Schedule:");
  if (scheduleLines.length) lines.push(...scheduleLines);
  else lines.push("Final working schedule to be determined based on the client's preferences.");
  lines.push("");
  lines.push("Tools and Resources:");
  if (tools.length) lines.push(...tools.map((tool) => tool.replace(/\.*$/, "")));
  else lines.push("To be confirmed with the client.");
  lines.push("");
  lines.push(labeled("Reporting", reporting));
  lines.push("");
  lines.push("Engagement Terms:");
  lines.push(...MOM_ENGAGEMENT_TERMS);
  lines.push("");
  lines.push(labeled("Recruitment Timeline", MOM_RECRUITMENT_TIMELINE));
  lines.push(labeled("Projected Start Date", start));
  lines.push("");
  lines.push("Next Steps:");
  lines.push(...nextSteps);
  lines.push("");
  lines.push(`We appreciate the opportunity to explore a potential partnership with ${company} and look forward to hearing from you.`);
  lines.push("");
  lines.push("Please feel free to reach out if you have any questions or need further information.");
  lines.push("");
  lines.push("Thank you!");
  return lines.join("\n");
}
