import assert from "node:assert/strict";
import test from "node:test";
import { probeSendPilotApiCredentials } from "./client.ts";
import {
  API_KEY_REJECTED,
  apiKeySaveBlockedByProbe,
  mapSendPilotApiProbe,
  WORKSPACE_VERIFY_UNSUPPORTED,
} from "./verify-api.ts";

test("bad API credentials map to a safe UI error", () => {
  assert.deepEqual(mapSendPilotApiProbe({ accepted: false, status: 401 }), {
    ok: false,
    error: API_KEY_REJECTED,
  });
  assert.deepEqual(mapSendPilotApiProbe({ accepted: false, status: 403 }), {
    ok: false,
    error: API_KEY_REJECTED,
  });
  assert.equal(apiKeySaveBlockedByProbe({ accepted: false, status: 401 }), API_KEY_REJECTED);
  assert.equal(apiKeySaveBlockedByProbe({ accepted: true, status: 404 }), null);
  assert.equal(apiKeySaveBlockedByProbe({ accepted: false, status: 503 }), null);
});

test("accepted probe does not claim a verified workspace id", () => {
  const mapped = mapSendPilotApiProbe({ accepted: true, status: 404 });
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.equal(mapped.workspaceVerified, false);
    assert.equal(mapped.workspaceMessage, WORKSPACE_VERIFY_UNSUPPORTED);
  }
});

test("upstream outages do not include raw SendPilot bodies", () => {
  const mapped = mapSendPilotApiProbe({ accepted: false, status: 500 });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) {
    assert.equal(mapped.error.includes("{"), false);
    assert.equal(mapped.error.toLowerCase().includes("stack"), false);
  }
});

test("credential probe uses GET /leads/{id} and never the env API key", async () => {
  const previousBase = process.env.SENDPILOT_API_BASE_URL;
  const previousKey = process.env.SENDPILOT_API_KEY;
  process.env.SENDPILOT_API_BASE_URL = "https://api.sendpilot.ai/v1";
  process.env.SENDPILOT_API_KEY = "must_not_be_sent";
  const originalFetch = globalThis.fetch;
  const sent: { url?: string; apiKey?: string } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.url = String(input);
    sent.apiKey = new Headers(init?.headers).get("X-API-Key") ?? "";
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await probeSendPilotApiCredentials({ apiKey: "account_key" });
    assert.equal(result.accepted, true);
    assert.equal(result.status, 404);
    assert.equal(sent.apiKey, "account_key");
    assert.match(sent.url ?? "", /\/leads\/00000000-0000-4000-8000-000000000001$/);
    assert.equal((sent.url ?? "").includes("must_not_be_sent"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBase === undefined) delete process.env.SENDPILOT_API_BASE_URL;
    else process.env.SENDPILOT_API_BASE_URL = previousBase;
    if (previousKey === undefined) delete process.env.SENDPILOT_API_KEY;
    else process.env.SENDPILOT_API_KEY = previousKey;
  }
});
