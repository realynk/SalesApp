const PLACEHOLDER_NAMES = new Set(["unnamed contact", "unnamed lead", "unknown company", "follow-up", "client"]);

function clean(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (PLACEHOLDER_NAMES.has(text.toLowerCase())) return "";
  return text;
}

export function personDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  companyName?: string | null;
}) {
  const first = clean(input.firstName);
  const last = clean(input.lastName);
  const joined = [first, last].filter(Boolean).join(" ");
  if (joined) return joined;
  const existing = clean(input.fullName);
  if (existing) return existing;
  const email = clean(input.email);
  if (email) return email;
  const company = clean(input.companyName);
  if (company) return company;
  return "Unnamed lead";
}

export function companyDisplayName(companyName?: string | null) {
  return clean(companyName);
}

export function personAndCompany(person: string, companyName?: string | null) {
  const company = companyDisplayName(companyName);
  if (!company || company.toLowerCase() === person.toLowerCase()) {
    return { primary: person, secondary: null as string | null };
  }
  return { primary: person, secondary: company };
}

export function compactLeadLabel(input: Parameters<typeof personDisplayName>[0]) {
  return personDisplayName(input);
}

export function spaciousLeadLabel(input: Parameters<typeof personDisplayName>[0]) {
  const primary = personDisplayName(input);
  return personAndCompany(primary, input.companyName);
}
