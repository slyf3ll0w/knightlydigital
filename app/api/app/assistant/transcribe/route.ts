import { NextRequest, NextResponse } from "next/server";
import { askAI } from "@/lib/ai";
import { voiceGate } from "@/lib/assistant-voice-gate";

/**
 * Ears for browsers without the Web Speech API (the iOS/Android app
 * shells' webviews): the recorded clip comes in as the raw body with its
 * MIME type, Gemini transcribes it, the text goes back. Browser speech
 * recognition is free and instant, so the drawer only uses this when it
 * must (lib/voice-chat-client.ts speechInputKind).
 */
const MAX_BYTES = 4 * 1024 * 1024;
const OK_MIME = /^audio\/(webm|mp4|m4a|mpeg|mp3|ogg|opus|wav|aac|flac)$/;

export async function POST(req: NextRequest) {
  const gate = await voiceGate("transcribe");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!OK_MIME.test(mime)) return NextResponse.json({ error: "Unsupported audio type." }, { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "Empty recording." }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "That recording is too long." }, { status: 413 });

  const text = await askAI({
    prompt:
      "Generate a transcript of the speech in this recording. Return ONLY the words spoken, as plain text with normal punctuation — no labels, no quotes, no commentary. If nothing intelligible is said, return an empty string.",
    audioBase64: buf.toString("base64"),
    audioMime: mime,
    temperature: 0,
    maxOutputTokens: 400,
    companyId: gate.actor.companyId,
    onUsage: (u) => {
      // ~Gemini Flash pricing, folded into the same meter as a chat turn
      const cents = (u.tokensIn * 30 + u.tokensOut * 250) / 1_000_000;
      void gate.charge(cents);
    },
  });
  if (text === null) return NextResponse.json({ error: "Couldn't transcribe that just now." }, { status: 424 });
  return NextResponse.json({ text: text.trim().replace(/^["'\s]+|["'\s]+$/g, "") });
}
