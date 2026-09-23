import { NextRequest, NextResponse } from "next/server";
import { limit } from "@/lib/rate-limit";

/**
 * POST { step, detail?, callId?, build? } — a breadcrumb from the iPhone
 * app's native calling engine (ios/App/App/VoipPlugin.swift), written to the
 * server log as `[voip-trace]`. The engine runs in the background under
 * CallKit where nothing else can see it, so this is how "slid to answer,
 * caller still hears ringback" gets diagnosed from Railway's logs.
 * Unauthenticated on purpose (the engine may be tracing exactly the step
 * where its session failed); it stores nothing and logs short strings only.
 */
export async function POST(req: NextRequest) {
  if (!(await limit("voip-trace", 600, 60_000)).ok) return NextResponse.json({ ok: false }, { status: 429 });
  const j = (await req.json().catch(() => null)) as { step?: unknown; detail?: unknown; callId?: unknown; build?: unknown } | null;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const step = s(j?.step, 40);
  if (!step) return NextResponse.json({ ok: false }, { status: 400 });
  console.info(`[voip-trace] ${step}${s(j?.callId, 40) ? ` call=${s(j?.callId, 40)}` : ""}${s(j?.build, 12) ? ` build=${s(j?.build, 12)}` : ""}${s(j?.detail, 300) ? ` ${s(j?.detail, 300)}` : ""}`);
  return NextResponse.json({ ok: true });
}
