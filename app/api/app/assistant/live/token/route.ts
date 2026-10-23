import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { voiceGate } from "@/lib/assistant-voice-gate";
import { liveSystemInstruction, toolsForActor } from "@/lib/assistant";

/**
 * Live voice (2026-10-23): a real two-way audio session with Gemini Live —
 * it hears, talks back within a beat, can be interrupted, and calls Atlas's
 * tools on our server for data and actions. This route mints the
 * short-lived token the browser connects with (our API key never leaves
 * the server) and hands over the session setup: Atlas's full instruction
 * for this company + user, every tool the user may use, the voice, and
 * transcription so the chat can show what was said.
 *
 * Cost: Gemini bills live audio by the minute (~0.5¢ in, ~1.8¢ out);
 * /api/app/assistant/live/usage meters it into Atlas tokens.
 */
const LIVE_MODEL = process.env.AI_MODEL_LIVE || "gemini-3.8-live";
const VOICE = process.env.ATLAS_VOICE || "Achird";

/** The one tool the BROWSER answers itself: confirming the ordinary cards Atlas staged. */
const CONFIRM_CARDS_DECL = {
  name: "confirm_cards",
  description:
    "The user said yes to the change(s) you just staged. Confirms every ordinary pending card from your last answer. Cards that move money or can't be undone are NOT confirmed by voice — the result tells you how many still need a tap in the chat.",
  parameters: { type: "object", properties: {} },
};

export async function POST() {
  const gate = await voiceGate("speak");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Live voice isn't configured." }, { status: 503 });

  const instruction = await liveSystemInstruction(gate.actor);
  if (!instruction) return NextResponse.json({ error: "No company." }, { status: 404 });
  const functionDeclarations = [...toolsForActor(gate.actor).map((t) => t.decl), CONFIRM_CARDS_DECL];

  // BidiGenerateContentSetup on the wire: modalities + voice live under
  // generationConfig; instruction, tools, transcription, VAD and resumption
  // are top-level fields. The browser spreads this next to `model`.
  const setupConfig = {
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
    systemInstruction: { parts: [{ text: instruction.text }] },
    tools: [{ functionDeclarations }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
        prefixPaddingMs: 120,
        silenceDurationMs: 600,
      },
    },
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
  };

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: iso(now + 30 * 60_000),
        newSessionExpireTime: iso(now + 2 * 60_000),
        liveConnectConstraints: { model: `models/${LIVE_MODEL}`, config: { responseModalities: ["AUDIO"], sessionResumption: {} } },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      reportError("live token: mint failed", res.status, (await res.text()).slice(0, 400));
      return NextResponse.json({ error: "Live voice is unavailable right now." }, { status: 424 });
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) {
      reportError("live token: no name in response", JSON.stringify(data).slice(0, 300));
      return NextResponse.json({ error: "Live voice is unavailable right now." }, { status: 424 });
    }
    return NextResponse.json({
      token: data.name,
      model: `models/${LIVE_MODEL}`,
      setup: setupConfig,
      assistantName: instruction.assistantName,
      metered: gate.metered,
    });
  } catch (err) {
    reportError("live token: request failed", err);
    return NextResponse.json({ error: "Live voice is unavailable right now." }, { status: 424 });
  }
}
