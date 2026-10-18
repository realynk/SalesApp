import { firstNameFromContact } from "../mom-email";

export type ProfileEmailDraft = {
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
};

export function buildSalesProfileEmail(input: {
  contactName: string;
  companyName: string;
  toEmail?: string | null;
  fromEmail?: string | null;
  senderName?: string | null;
  cc?: string | null;
}): ProfileEmailDraft {
  const firstName = firstNameFromContact(input.contactName);
  const company = input.companyName.trim() || "your company";
  const sender = input.senderName?.trim() || "Realynk Assistants";
  return {
    from: (input.fromEmail ?? "").trim(),
    to: (input.toEmail ?? "").trim(),
    cc: (input.cc ?? "").trim(),
    subject: `Realynk Assistants introduction — ${company}`,
    body: [
      `Hi ${firstName},`,
      "",
      "Thank you for your interest in Realynk Assistants.",
      "",
      `I'm sharing a few virtual assistant profiles for ${company}. This is our first sales/VA introduction so we can see who may be a fit. We can adjust the mix once we confirm the role, hours, and interview windows.`,
      "",
      "Nothing here is a final placement. If the profiles look relevant, the next step is a short call to walk through requirements.",
      "",
      "Please let me know if anyone else should be copied on this thread.",
      "",
      "Best,",
      sender,
    ].join("\n"),
  };
}
