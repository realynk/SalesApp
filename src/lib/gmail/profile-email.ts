export const CLIENT_FIRST_NAME_PLACEHOLDER = "[Client First Name]";
export const OUTREACH_FIRST_NAME_PLACEHOLDER = "[LinkedIn Outreach Account First Name]";

export const PROFILE_EMAIL_CALENDAR_URL = "https://realynk.com/realynk-outbound";

export const PROFILE_EMAIL_CANDIDATES = [
  { name: "Thea", url: "https://jobcentra.com/thea-sungcal-portfolio" },
  { name: "Ronimar", url: "https://jobcentra.com/ronimar-deocadiz-portfolio" },
  { name: "Earl", url: "https://jobcentra.com/earl-jae-klient-calustre-portfolio" },
  { name: "Gladys", url: "https://jobcentra.com/gladys-bariquit-portfolio" },
] as const;

export const PROFILE_EMAIL_WEBSITE_URL = "https://www.realynk.com/";
export const PROFILE_EMAIL_SIGNATURE_DIVIDER = "---";
export const JOAN_PROFILE_EMAIL_SIGNATURE = [
  "Best regards,",
  "**Joan Baclayon | Client Success Lead**",
  `Realynk | [www.realynk.com](${PROFILE_EMAIL_WEBSITE_URL})`,
  "",
  "500 4th Street, Albuquerque, NM, 87102",
  "",
  "*IMPORTANT: The contents of this email and any attachments are confidential. They are intended for the named recipient(s) only. If you have received this email by mistake, please notify the sender immediately and do not disclose the contents to anyone or make copies thereof.*",
].join("\n");

const SIGNATURE_BLOCK = `${PROFILE_EMAIL_SIGNATURE_DIVIDER}\n\n${JOAN_PROFILE_EMAIL_SIGNATURE}`;
const SIGNATURE_TAIL =
  /\n*(?:---\n+)?Best regards,\s*\n\*\*Joan Baclayon \| Client Success Lead\*\*[\s\S]*confidential[\s\S]*$/i;

export function stripProfileEmailSignature(body: string) {
  return String(body ?? "").replace(SIGNATURE_TAIL, "").replace(/\s+$/g, "");
}

export function withProfileEmailSignature(body: string) {
  return `${stripProfileEmailSignature(body)}\n\n${SIGNATURE_BLOCK}`;
}

export type ProfileEmailDraft = {
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
};

const WORKSPACE_ACCOUNT_LABEL = /^(untitled|realynk main)$/i;

function firstToken(value: string | null | undefined) {
  const token = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")[0];
  return token || null;
}

export function clientFirstNameForProfileEmail(input: {
  firstName?: string | null;
  contactName?: string | null;
}) {
  return firstToken(input.firstName) ?? firstToken(input.contactName) ?? CLIENT_FIRST_NAME_PLACEHOLDER;
}

export function linkedInOutreachFirstName(integrationName: string | null | undefined) {
  const name = String(integrationName ?? "").replace(/\s+/g, " ").trim();
  if (!name || WORKSPACE_ACCOUNT_LABEL.test(name)) return null;
  return firstToken(name);
}

export function originalLinkedInOutreachFirstName(
  identities: Array<{ integrationName?: string | null; firstSeenAt?: string | null }>,
) {
  const usable = identities
    .map((row) => ({
      name: linkedInOutreachFirstName(row.integrationName),
      firstSeenAt: row.firstSeenAt ?? null,
    }))
    .filter((row): row is { name: string; firstSeenAt: string | null } => Boolean(row.name));
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0].name;
  const dated = usable.filter((row) => row.firstSeenAt);
  if (dated.length === 0) return null;
  dated.sort((left, right) => String(left.firstSeenAt).localeCompare(String(right.firstSeenAt)));
  const earliest = dated[0]?.firstSeenAt;
  const ties = dated.filter((row) => row.firstSeenAt === earliest).map((row) => row.name);
  if (new Set(ties).size !== 1) return null;
  return ties[0] ?? null;
}

export function buildSalesProfileEmail(input: {
  contactName?: string | null;
  clientFirstName?: string | null;
  outreachFirstName?: string | null;
  companyName?: string | null;
  toEmail?: string | null;
  fromEmail?: string | null;
  cc?: string | null;
}): ProfileEmailDraft {
  const clientFirstName = clientFirstNameForProfileEmail({
    firstName: input.clientFirstName,
    contactName: input.contactName,
  });
  const outreachFirstName = linkedInOutreachFirstName(input.outreachFirstName) ?? OUTREACH_FIRST_NAME_PLACEHOLDER;
  const company = input.companyName?.trim();
  const candidates = PROFILE_EMAIL_CANDIDATES.map(
    (candidate, index) => `${index + 1}. **${candidate.name}** – [View Profile](${candidate.url})`,
  );
  const body = [
    `Hi ${clientFirstName},`,
    "",
    `This is Joan from Realynk Assistants. ${outreachFirstName} recently connected with you on LinkedIn.`,
    "",
    "I'm sharing a list of pre-vetted SDRs available to work exclusively with your business:",
    "",
    ...candidates,
    "",
    "We can also custom-match a VA based on your specific requirements.",
    "",
    "Would you be open to a quick 20-minute call next week?",
    "",
    `If another time works better, feel free to book a slot directly through [our calendar](${PROFILE_EMAIL_CALENDAR_URL}).`,
    "",
    "With the current demand for SDRs, we can hold shortlisted candidates for up to 7 days before making them available to other clients.",
    "",
    "Thank you!",
  ].join("\n");
  return {
    from: (input.fromEmail ?? "").trim(),
    to: (input.toEmail ?? "").trim(),
    cc: (input.cc ?? "").trim(),
    subject: company ? `SDR profiles from Realynk Assistants — ${company}` : "SDR profiles from Realynk Assistants",
    body: withProfileEmailSignature(body),
  };
}
