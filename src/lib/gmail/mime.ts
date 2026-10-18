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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatProfileEmailLine(line: string, mode: "plain" | "html") {
  if (/^---+$/.test(line.trim())) return mode === "html" ? "<hr>" : "----------";
  if (mode === "plain") {
    return line
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
  }
  return escapeHtml(line)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function profileEmailPlainBody(body: string) {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => formatProfileEmailLine(line, "plain"))
    .join("\n");
}

export function profileEmailHtmlBody(body: string) {
  const withMarkup = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => formatProfileEmailLine(line, "html"))
    .join("<br>\r\n");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${withMarkup}</div>`;
}

function encodePart(contentType: string, body: string) {
  return [
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8").toString("base64"),
  ].join("\r\n");
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
  const boundary = "realynk_profile_email";
  const headers = [
    `From: ${input.from.trim()}`,
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encodeSubject(input.subject.trim() || "(no subject)")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const payload = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    encodePart("text/plain", profileEmailPlainBody(input.body)),
    `--${boundary}`,
    encodePart("text/html", profileEmailHtmlBody(input.body)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(payload).toString("base64url");
}
