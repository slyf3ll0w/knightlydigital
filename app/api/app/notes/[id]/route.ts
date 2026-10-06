import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, type Actor } from "@/lib/permissions";
import { checkFeature } from "@/lib/plan-gate";
import { canEditNote, capReached, noteInclude, serializeNote, validateBody, validateColor, type StickyColor } from "@/lib/sticky-notes";

/**
 * PATCH { body?, color?, shared? } / DELETE (soft: archivedAt). The author
 * may edit their own note; a team note can also be edited or taken down by
 * an owner / admin.
 */
async function findEditable(actor: Actor, id: string) {
  const note = await prisma.stickyNote.findFirst({
    where: { id, companyId: actor.companyId, archivedAt: null },
    include: noteInclude,
  });
  if (!note || !canEditNote(actor, note)) return null;
  return note;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const note = await findEditable(actor, id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const data: { body?: string; color?: StickyColor; shared?: boolean } = {};
  if (body.body !== undefined) {
    const text = validateBody(body.body);
    if ("error" in text) return NextResponse.json({ error: text.error }, { status: 400 });
    data.body = text.body;
  }
  if (body.color !== undefined) {
    const color = validateColor(body.color);
    if (!color) return NextResponse.json({ error: "Pick one of the five colors." }, { status: 400 });
    data.color = color;
  }
  if (typeof body.shared === "boolean" && body.shared !== note.shared) {
    // Only the author pins or unpins; a manager taking a team note down uses DELETE
    if (note.userId !== actor.id) return NextResponse.json({ error: "Only the author can pin or unpin this note." }, { status: 403 });
    if (body.shared) {
      const gate = await checkFeature(actor.companyId, "team_notes");
      if (!gate.ok) return gate.response;
    }
    const full = await capReached(actor, body.shared, note.id);
    if (full) return NextResponse.json({ error: full }, { status: 400 });
    data.shared = body.shared;
  }

  const updated = await prisma.stickyNote.update({ where: { id: note.id }, data, include: noteInclude });
  const placement = await prisma.stickyNotePlacement.findUnique({ where: { noteId_userId: { noteId: note.id, userId: actor.id } } });
  return NextResponse.json({ note: serializeNote(updated, actor, placement) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const note = await findEditable(actor, id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.stickyNote.update({ where: { id: note.id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
