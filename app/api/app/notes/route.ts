import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { checkFeature } from "@/lib/plan-gate";
import {
  capReached,
  listNotes,
  noteInclude,
  randomRotation,
  serializeNote,
  validateBody,
  validateColor,
} from "@/lib/sticky-notes";

/**
 * GET — the viewer's board: own live notes + the team's pinned ones, with
 * this viewer's placements. POST { body, color?, shared? } — stick a note.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ notes: await listNotes(actor) });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const text = validateBody(body.body);
  if ("error" in text) return NextResponse.json({ error: text.error }, { status: 400 });
  const color = validateColor(body.color) ?? "YELLOW";
  const shared = body.shared === true;
  if (shared) {
    // Dark until PLAN_GATING=1 (lib/plan-gate.ts)
    const gate = await checkFeature(actor.companyId, "team_notes");
    if (!gate.ok) return gate.response;
  }
  const full = await capReached(actor, shared);
  if (full) return NextResponse.json({ error: full }, { status: 400 });

  const note = await prisma.stickyNote.create({
    data: { companyId: actor.companyId, userId: actor.id, body: text.body, color, shared, rotation: randomRotation() },
    include: noteInclude,
  });
  return NextResponse.json({ note: serializeNote(note, actor, null) }, { status: 201 });
}
