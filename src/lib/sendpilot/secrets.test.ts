import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret, SecretConfigError, SecretPayloadError } from "./secrets.ts";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

test("encryption round trip", () => {
  const packed = encryptSecret("whsec_test_secret", KEY);
  assert.equal(decryptSecret(packed, KEY), "whsec_test_secret");
  assert.match(packed, /^v1\./);
});

test("random IV means the same plaintext does not produce the same ciphertext", () => {
  const first = encryptSecret("whsec_test_secret", KEY);
  const second = encryptSecret("whsec_test_secret", KEY);
  assert.notEqual(first, second);
  assert.equal(decryptSecret(first, KEY), decryptSecret(second, KEY));
});

test("tampered ciphertext fails authentication", () => {
  const packed = encryptSecret("whsec_test_secret", KEY);
  const parts = packed.split(".");
  const body = Buffer.from(parts[2] ?? "", "base64url");
  body[0] = body[0] ^ 0xff;
  const tampered = `${parts[0]}.${parts[1]}.${body.toString("base64url")}`;
  assert.throws(() => decryptSecret(tampered, KEY), SecretPayloadError);
});

test("wrong encryption key fails", () => {
  const packed = encryptSecret("whsec_test_secret", KEY);
  assert.throws(() => decryptSecret(packed, OTHER_KEY), SecretPayloadError);
});

test("missing encryption key fails safely without exposing plaintext", () => {
  const previous = process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptSecret("whsec_test_secret"), SecretConfigError);
    const packed = encryptSecret("whsec_test_secret", KEY);
    assert.throws(() => decryptSecret(packed), SecretConfigError);
  } finally {
    if (previous === undefined) delete process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY;
    else process.env.SENDPILOT_SECRETS_ENCRYPTION_KEY = previous;
  }
});

test("short keys are rejected", () => {
  assert.throws(() => encryptSecret("secret", "abcd"), SecretConfigError);
});
