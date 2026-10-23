import { NextRequest, NextResponse } from "next/server";
import { recordAiUsage } from "@/lib/usage";
import { voiceGate } from "@/lib/assistant-voice-gate";

/**
 * Meters a live voice session into Atlas tokens: the browser reports the
 * seconds of audio it sent and received (every minute and at the end).
 * Rates default to Gemini Live's per-minute audio prices.
 */
const IN_CENTS_PER_MIN = Number(process.env.LIVE_AUDIO_IN_CENTS_PER_MIN) || 0.5;
const OUT_CENTS_PER_MIN = Number(process.env.LIVE_AUDIO_OUT_CENTS_PER_MIN) || 1.8;

export async function POST(req: NextRequest) {
  const gate = await voiceGate("speak");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { inSeconds?: unknown; outSeconds?: unknown };
  const inS = Math.min(3600, Math.max(0, Number(body.inSeconds) || 0));
  const outS = Math.min(3600, Math.max(0, Number(body.outSeconds) || 0));
  if (inS + outS <= 0) return NextResponse.json({ ok: true });
  const cents = (inS / 60) * IN_CENTS_PER_MIN + (outS / 60) * OUT_CENTS_PER_MIN;
  // ~25 audio tokens per second either way, for the platform ledger
  recordAiUsage(gate.actor.companyId, { tokensIn: Math.round(inS * 25), tokensOut: Math.round(outS * 25), tokensCached: 0 });
  await gate.charge(cents);
  return NextResponse.json({ ok: true });
}
