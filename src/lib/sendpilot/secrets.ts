import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = "v1";

export class SecretConfigError extends Error {
  constructor() {
    super("SendPilot credential encryption is not configured.");
    this.name = "SecretConfigError";
  }
}

export class SecretPayloadError extends Error {
  constructor() {
    super("SendPilot credential payload is invalid.");
    this.name = "SecretPayloadError";
  }
}

function encryptionKeyFromEnv(raw = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY): Buffer {
  const value = raw?.trim() || "";
  if (!value) throw new SecretConfigError();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === KEY_BYTES) return decoded;
  } catch {
    throw new SecretConfigError();
  }
  throw new SecretConfigError();
}

export function sendpilotSecretsEncryptionKeyPresent() {
  return Boolean(process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY?.trim());
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const text = plaintext.trim();
  if (!text) throw new SecretPayloadError();
  const key = encryptionKeyFromEnv(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString("base64url")}.${Buffer.concat([encrypted, tag]).toString("base64url")}`;
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const packed = payload.trim();
  if (!packed) throw new SecretPayloadError();
  const key = encryptionKeyFromEnv(rawKey);
  const parts = packed.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new SecretPayloadError();
  let iv: Buffer;
  let body: Buffer;
  try {
    iv = Buffer.from(parts[1] ?? "", "base64url");
    body = Buffer.from(parts[2] ?? "", "base64url");
  } catch {
    throw new SecretPayloadError();
  }
  if (iv.length !== IV_BYTES || body.length <= 16) throw new SecretPayloadError();
  const ciphertext = body.subarray(0, body.length - 16);
  const tag = body.subarray(body.length - 16);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretPayloadError();
  }
}
