import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { canEditNote, validatePos } from "@/lib/sticky-notes";

/**
 * PUT { x, y, z? } — where a note sits for THIS viewer (px on its page).
 * The author's drag moves the note itself; a teammate's drag of a team
 * note moves only their own copy, so nobody else's page changes.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const note = await prisma.stickyNote.findFirst({
    where: { id, companyId: actor.companyId, archivedAt: null, OR: [{ userId: actor.id }, { shared: true }] },
    select: { id: true, userId: true, shared: true },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const x = validatePos(body.x);
  const y = validatePos(body.y);
  if (x === null || y === null) return NextResponse.json({ error: "x and y must be numbers." }, { status: 400 });
  const z = typeof body.z === "number" && Number.isFinite(body.z) ? Math.max(0, Math.min(100000, Math.round(body.z))) : 0;
  // Only the author moves the note itself. A manager may edit a team note's
  // text, but their drag is personal like anyone else's — otherwise one
  // owner's tidy-up would move the note on every teammate's page.
  if (note.userId === actor.id) {
    await prisma.stickyNote.update({ where: { id: note.id }, data: { x, y } });
    // and drop any stale personal override so the author sees what they set
    await prisma.stickyNotePlacement.deleteMany({ where: { noteId: note.id, userId: actor.id } });
  } else {
    await prisma.stickyNotePlacement.upsert({
      where: { noteId_userId: { noteId: note.id, userId: actor.id } },
      create: { noteId: note.id, userId: actor.id, x, y, z },
      update: { x, y, z },
    });
  }
  return NextResponse.json({ ok: true });
}
