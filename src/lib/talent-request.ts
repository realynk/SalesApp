export type TalentFacts = {
  companyName?: string | null;
  clientName?: string | null;
  role?: string | null;
  headcount?: number | null;
  responsibilities?: string | null;
  skills?: string | null;
  schedule?: string | null;
  timezone?: string | null;
  budget?: string | null;
  experience?: string | null;
  special?: string | null;
  startDate?: string | null;
};

const LABELS: Array<[keyof TalentFacts, string]> = [
  ["companyName", "Client / company"],
  ["clientName", "Client contact"],
  ["role", "VA role"],
  ["headcount", "Number of VAs"],
  ["responsibilities", "Responsibilities"],
  ["skills", "Required skills"],
  ["schedule", "Work schedule"],
  ["timezone", "Time zone"],
  ["budget", "Budget or approved rate"],
  ["experience", "Preferred experience"],
  ["special", "Special requirements"],
  ["startDate", "Target start date"],
];

function present(value: string | number | null | undefined) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim().length > 0;
}

export function missingTalentFields(facts: TalentFacts) {
  return LABELS.filter(([key]) => !present(facts[key])).map(([, label]) => label);
}

export function buildTalentRequestEmail(facts: TalentFacts) {
  const missing = missingTalentFields(facts);
  const line = (label: string, value: string | number | null | undefined) =>
    present(value) ? `${label}: ${value}` : `${label}: [Not in SalesApp yet]`;
  const company = facts.companyName?.trim() || "the client";
  const body = [
    "Hi Recruitment,",
    "",
    `Please help us source candidates for ${company}. This draft uses only information already saved in SalesApp.`,
    "",
    line("Client / company", facts.companyName),
    line("Client contact", facts.clientName),
    line("VA role", facts.role),
    line("Number of VAs", facts.headcount),
    line("Responsibilities", facts.responsibilities),
    line("Required skills", facts.skills),
    line("Work schedule", facts.schedule),
    line("Time zone", facts.timezone),
    line("Budget or approved rate", facts.budget),
    line("Preferred experience", facts.experience),
    line("Special requirements", facts.special),
    line("Target start date", facts.startDate),
    "",
    missing.length > 0
      ? `Still needed before this is complete:\n${missing.map((item) => `- ${item}`).join("\n")}`
      : "All listed fields were present in SalesApp.",
    "",
    "Thank you,",
    "Sales",
  ].join("\n");
  return { body, missing };
}
