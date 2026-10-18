function encodeSubject(subject: string) {
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export function parseAddressList(value: string | null | undefined) {
  return String(value ?? "")
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function buildGmailRawMessage(input: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}) {
  const to = parseAddressList(input.to);
  const cc = parseAddressList(input.cc);
  if (!looksLikeEmail(input.from) || to.length === 0 || to.some((address) => !looksLikeEmail(address))) {
    throw new Error("From and To need valid email addresses.");
  }
  if (cc.some((address) => !looksLikeEmail(address))) {
    throw new Error("CC needs valid email addresses.");
  }
  const headers = [
    `From: ${input.from.trim()}`,
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encodeSubject(input.subject.trim() || "(no subject)")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const payload = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(input.body.replace(/\n/g, "\r\n"), "utf8").toString("base64")}`;
  return Buffer.from(payload).toString("base64url");
}
