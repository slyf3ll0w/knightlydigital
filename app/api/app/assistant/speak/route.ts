import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { recordAiUsage } from "@/lib/usage";
import { voiceGate } from "@/lib/assistant-voice-gate";

/**
 * Atlas's voice: text → WAV through Gemini's speech model (the Interactions
 * API, `response_format: audio`, 24 kHz mono 16-bit WAV). Claude does the
 * thinking in the chat; this only reads the reply out. ATLAS_VOICE picks
 * the prebuilt voice (default Achird, "friendly"); unset GEMINI_API_KEY
 * means 503 and the drawer falls back to the device's own voice.
 *
 * Cost is per character of text; metered accounts are debited in Atlas
 * tokens at ATLAS_TTS_CENTS_PER_1K_CHARS (default 1¢ per 1,000 characters).
 */
const TTS_MODEL = process.env.AI_MODEL_TTS || "gemini-3.8-flash-lite-tts";
const VOICE = process.env.ATLAS_VOICE || "Achird";
const CENTS_PER_1K = (() => {
  const n = Number(process.env.ATLAS_TTS_CENTS_PER_1K_CHARS);
  return Number.isFinite(n) && n >= 0 ? n : 1;
})();
const MAX_CHARS = 1200;

type InteractionsResponse = {
  output_audio?: { data?: string; mime_type?: string };
  steps?: { content?: { type?: string; data?: string; mime_type?: string }[] }[];
  content?: { type?: string; data?: string; mime_type?: string }[];
  error?: { message?: string };
};

function findAudio(res: InteractionsResponse): { data: string; mime: string } | null {
  if (res.output_audio?.data) return { data: res.output_audio.data, mime: res.output_audio.mime_type ?? "audio/wav" };
  const pools = [...(res.steps ?? []).flatMap((s) => s.content ?? []), ...(res.content ?? [])];
  const hit = pools.find((c) => typeof c.data === "string" && c.data.length > 0);
  return hit ? { data: hit.data!, mime: hit.mime_type ?? "audio/wav" } : null;
}

export async function POST(req: NextRequest) {
  const gate = await voiceGate("speak");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice isn't configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: "warm, natural, unhurried; a capable assistant speaking to a colleague" }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: VOICE }] },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      reportError("assistant speak: TTS error", res.status, (await res.text()).slice(0, 400));
      return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 424 });
    }
    const data = (await res.json()) as InteractionsResponse;
    const audio = findAudio(data);
    if (!audio) {
      reportError("assistant speak: no audio in response", JSON.stringify(data).slice(0, 400));
      return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 424 });
    }
    const cents = (text.length / 1000) * CENTS_PER_1K;
    recordAiUsage(gate.actor.companyId, { tokensIn: text.length, tokensOut: 0, tokensCached: 0 });
    await gate.charge(cents);
    return new NextResponse(Buffer.from(audio.data, "base64"), {
      status: 200,
      headers: { "Content-Type": audio.mime.startsWith("audio/") ? audio.mime : "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err) {
    reportError("assistant speak: request failed", err);
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 424 });
  }
}
