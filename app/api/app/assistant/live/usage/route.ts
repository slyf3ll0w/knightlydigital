import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAiUsage } from "@/lib/usage";
import { voiceGate } from "@/lib/assistant-voice-gate";
import { applyReport, audioCents } from "@/lib/live-voice-meter";

/**
 * Meters a live voice session into Atlas tokens: the browser reports the
 * seconds of audio it sent and received (every minute and at the end),
 * naming the session its token was minted for. The session was prepaid at
 * mint, so a report is charged only past that (lib/live-voice-meter.ts).
 * Rates default to Gemini Live's per-minute audio prices.
 */
export async function POST(req: NextRequest) {
  const gate = await voiceGate("speak");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { inSeconds?: unknown; outSeconds?: unknown; sessionId?: unknown };
  const inS = Math.min(3600, Math.max(0, Number(body.inSeconds) || 0));
  const outS = Math.min(3600, Math.max(0, Number(body.outSeconds) || 0));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 40) : "";

  if (sessionId) {
    const session = await prisma.liveVoiceSession.findFirst({
      where: { id: sessionId, userId: gate.actor.id, companyId: gate.actor.companyId },
      select: { id: true, startedAt: true, inSeconds: true, outSeconds: true, chargedCents: true },
    });
    if (!session) return NextResponse.json({ ok: true });
    const now = new Date();
    const next = applyReport(session, { inSeconds: inS, outSeconds: outS }, now);
    if (!next) return NextResponse.json({ ok: true });
    // Claimed on the totals we read, so two reports landing together can't both be charged from the same base.
    const claimed = await prisma.liveVoiceSession.updateMany({
      where: { id: session.id, inSeconds: session.inSeconds, outSeconds: session.outSeconds },
      data: { inSeconds: next.inSeconds, outSeconds: next.outSeconds, chargedCents: next.chargedCents, lastReportAt: now },
    });
    if (claimed.count === 0) return NextResponse.json({ ok: true });
    const addedIn = next.inSeconds - session.inSeconds;
    const addedOut = next.outSeconds - session.outSeconds;
    // ~25 audio tokens per second either way, for the platform ledger
    if (addedIn + addedOut > 0) recordAiUsage(gate.actor.companyId, { tokensIn: Math.round(addedIn * 25), tokensOut: Math.round(addedOut * 25), tokensCached: 0 });
    if (next.chargeNow > 0) await gate.charge(next.chargeNow);
    return NextResponse.json({ ok: true });
  }

  // A page loaded before sessions existed (it sends no id): charged as before,
  // and its newest session is marked as reporting so it isn't counted as silent.
  if (inS + outS <= 0) return NextResponse.json({ ok: true });
  const newest = await prisma.liveVoiceSession.findFirst({ where: { userId: gate.actor.id }, orderBy: { startedAt: "desc" }, select: { id: true } });
  if (newest) await prisma.liveVoiceSession.update({ where: { id: newest.id }, data: { lastReportAt: new Date() } }).catch(() => {});
  recordAiUsage(gate.actor.companyId, { tokensIn: Math.round(inS * 25), tokensOut: Math.round(outS * 25), tokensCached: 0 });
  await gate.charge(audioCents(inS, outS));
  return NextResponse.json({ ok: true });
}
