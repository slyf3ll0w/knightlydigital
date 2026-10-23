import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { DEFAULT_ACCENT, isAccentCode, isVoiceId } from "@/lib/atlas-voices";
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

/** The tools the BROWSER answers itself: the cards Atlas staged are on the talk screen; these settle them. */
const CONFIRM_CARDS_DECL = {
  name: "confirm_cards",
  description:
    "Applies every ordinary card still waiting on the talk screen (even if a few turns have passed since you staged them). Call it (a) right after staging, in the same turn, when the user explicitly TOLD you to do the thing — their instruction was the yes — and (b) when they agree to something you proposed: \"yes\", \"I confirm\", \"go ahead\", \"do it\", \"send it\", \"sounds good\". Cards that move money or can't be undone are never applied by voice — the result says how many still need a tap on the card on screen. The result also lists any card that failed and why, so you can fix the cause.",
  parameters: { type: "object", properties: {} },
};
const SKIP_CARDS_DECL = {
  name: "skip_cards",
  description:
    "The user declined the pending card(s) — \"no\", \"don't\", \"skip it\", \"never mind\", \"cancel that\". Dismisses every card still waiting on the talk screen.",
  parameters: { type: "object", properties: {} },
};

export async function POST(req: NextRequest) {
  const gate = await voiceGate("speak");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Live voice isn't configured." }, { status: 503 });
  // The listener's voice + accent pick (lib/atlas-voices.ts), validated.
  const body = (await req.json().catch(() => ({}))) as { voice?: unknown; accent?: unknown };
  const voiceName = isVoiceId(body.voice) ? body.voice : VOICE;
  const languageCode = isAccentCode(body.accent) ? body.accent : DEFAULT_ACCENT;

  const instruction = await liveSystemInstruction(gate.actor);
  if (!instruction) return NextResponse.json({ error: "No company." }, { status: 404 });
  // No queue_next_step in a live session: the chat drawer fires queued steps
  // after cards settle, but here the model is present the whole time and
  // just does the next step itself. (It looped on it 12× in the 2026-10-23
  // report because each live tool call has its own ctx and "nothing is
  // staged yet this turn" was always true.)
  const functionDeclarations = [
    ...toolsForActor(gate.actor)
      .filter((t) => t.decl.name !== "queue_next_step")
      .map((t) => t.decl),
    CONFIRM_CARDS_DECL,
    SKIP_CARDS_DECL,
  ];

  // BidiGenerateContentSetup on the wire: modalities + voice live under
  // generationConfig; instruction, tools, transcription, VAD and resumption
  // are top-level fields. The browser spreads this next to `model`.
  const setupConfig = {
    generationConfig: {
      responseModalities: ["AUDIO"],
      // languageCode pins the session to English (the 2026-10-23 report had
      // echo fragments transcribed as Portuguese/Spanish/German) and sets
      // the accent — en-GB is how "a British voice" happens.
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } }, languageCode },
    },
    systemInstruction: { parts: [{ text: instruction.text }] },
    tools: [{ functionDeclarations }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      // Start detection LOW: HIGH fired on Atlas's own voice leaking through
      // the phone speaker and on room noise (2026-10-23 report). End stays
      // quick so the reply comes within a beat of the user stopping.
      automaticActivityDetection: {
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
        endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
        prefixPaddingMs: 200,
        silenceDurationMs: 700,
      },
    },
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
  };

  // Verified against the real API 2026-10-23 (scratch probe): the REST body
  // field is `bidiGenerateContentSetup` (the SDK's "liveConnectConstraints"
  // is a client-side name — the API 400s on it), and the token locks ONLY
  // the fields named in `fieldMask`. Without a mask the token's setup
  // replaces the connection's setup wholesale — no instruction, no tools —
  // so we lock just the model and let the browser's setup carry the rest.
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
        bidiGenerateContentSetup: { model: `models/${LIVE_MODEL}` },
        fieldMask: "model",
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
