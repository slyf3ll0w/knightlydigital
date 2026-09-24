import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { VoiceError, startAtlasNotes, stopAtlasNotes } from "@/lib/voice";

/**
 * The call screen's notes card (app/platform/calls/[id]/CallNotes.tsx).
 *
 * GET  — the row's notes state: the typed notes, and where Atlas is with
 *        its own (lib/call-notes.ts: null | listening | summarizing | done |
 *        failed), plus the transcript. Polled while Atlas is on the call.
 * POST { action: "start" } — Atlas starts listening (Telnyx transcription
 *        on the customer leg); { action: "stop" } — stop now and write the
 *        notes from what was heard. Both cost Atlas tokens only at the
 *        summary, through the metered one-shot.
 * The typed notes themselves save through PATCH /api/app/calls/[id].
 */
const select = {
  status: true,
  notes: true,
  transcript: true,
  atlasNotes: true,
  atlasNotesState: true,
  atlasNotesError: true,
  atlasNotesTokens: true,
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const call = await prisma.call.findFirst({ where: { id, companyId: actor.companyId }, select });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(call, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  try {
    const out =
      body.action === "start"
        ? await startAtlasNotes(actor.companyId, id, actor.id)
        : body.action === "stop"
          ? await stopAtlasNotes(actor.companyId, id)
          : null;
    if (!out) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[voice] atlas notes route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
