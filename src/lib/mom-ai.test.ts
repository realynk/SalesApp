import assert from "node:assert/strict";
import test from "node:test";
import { generateMomFromRecording, parseMomFill, recordingTooLarge } from "./mom-ai.ts";

test("recordings over 25 MB are rejected", () => {
  assert.equal(recordingTooLarge(25 * 1024 * 1024 + 1), true);
  assert.equal(recordingTooLarge(1024), false);
});

test("LLM JSON must match the MOM fill shape", () => {
  const fill = parseMomFill({
    industry: "ITAD",
    tasks: ["Cold call"],
    extra: "ignored",
  });
  assert.equal(fill?.industry, "ITAD");
  assert.deepEqual(fill?.tasks, ["Cold call"]);
});

test("missing API key still returns a field-based MOM", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const result = await generateMomFromRecording({
    facts: { contactName: "Chris", companyName: "NextGen ITAD", role: "SDR" },
    recording: new File([new Uint8Array([1, 2, 3])], "call.mp3", { type: "audio/mpeg" }),
    fetchImpl: async () => {
      throw new Error("should not call OpenAI without a key");
    },
  });
  if (previous) process.env.OPENAI_API_KEY = previous;
  assert.match(result.email, /Hi Chris,/);
  assert.match(result.warning ?? "", /OPENAI_API_KEY/);
});
