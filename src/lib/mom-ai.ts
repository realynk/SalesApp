import { z } from "zod";
import { buildMomEmail, type MomFacts, type MomFill } from "./mom-email";

export const MAX_MOM_RECORDING_BYTES = 25 * 1024 * 1024;

const FILL_SCHEMA = z.object({
  industry: z.string().optional(),
  role: z.string().optional(),
  tasks: z.array(z.string()).optional(),
  staffingPlan: z.string().optional(),
  rate: z.string().optional(),
  monthlyCost: z.string().optional(),
  schedule: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  reporting: z.string().optional(),
  startDate: z.string().optional(),
  nextSteps: z.array(z.string()).optional(),
  supportFocus: z.string().optional(),
});

export function openaiMomKey() {
  return (process.env.OPENAI_API_KEY || "").trim();
}

export function recordingTooLarge(size: number) {
  return size > MAX_MOM_RECORDING_BYTES;
}

export function parseMomFill(value: unknown): MomFill | null {
  const parsed = FILL_SCHEMA.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

const SYSTEM_PROMPT = `You write structured minutes for a Realynk Assistants sales call.
Return JSON only. Use only facts from the transcript and the provided CRM fields.
Do not invent rates, hours, costs, tools, start dates, or commitments that are not stated.
If a field is unknown, omit it. tasks, schedule, tools, and nextSteps must be short arrays of strings.`;

export async function transcribeRecording(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = openaiMomKey();
  if (!key) {
    return {
      ok: false,
      error: "Set OPENAI_API_KEY on the server to transcribe a recording. The MOM email can still be generated from the call fields.",
    };
  }
  if (recordingTooLarge(file.size)) {
    return { ok: false, error: "Keep the recording under 25 MB." };
  }
  const body = new FormData();
  body.set("file", file, file.name || "recording.mp3");
  body.set("model", "whisper-1");
  const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: "The recording could not be transcribed. Try a shorter mp3, m4a, wav, or mp4 clip." };
  }
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) return { ok: false, error: "The recording did not return any speech." };
  return { ok: true, text };
}

export async function fillMomFromTranscript(
  facts: MomFacts,
  transcript: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MomFill | null> {
  const key = openaiMomKey();
  if (!key || !transcript.trim()) return null;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            crm: facts,
            transcript,
          }),
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (!response.ok || typeof content !== "string") return null;
  try {
    return parseMomFill(JSON.parse(content));
  } catch {
    return null;
  }
}

export async function generateMomFromRecording(input: {
  facts: MomFacts;
  recording?: File | null;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  let transcript = "";
  let warning: string | undefined;
  if (input.recording && input.recording.size > 0) {
    const spoken = await transcribeRecording(input.recording, fetchImpl);
    if (!spoken.ok) warning = spoken.error;
    else {
      transcript = spoken.text;
      const fill = await fillMomFromTranscript(input.facts, transcript, fetchImpl);
      return { email: buildMomEmail(input.facts, fill), transcript, warning };
    }
  }
  return { email: buildMomEmail(input.facts), transcript, warning };
}
