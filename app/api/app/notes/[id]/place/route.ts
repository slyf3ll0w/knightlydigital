import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * PUT { x, y, z? } — where this note sits on THIS viewer's desktop board
 * (0–1 of the board's width / height). Anyone who can see the note may
 * place it; nobody else's board moves.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const note = await prisma.stickyNote.findFirst({
    where: { id, companyId: actor.companyId, archivedAt: null, OR: [{ userId: actor.id }, { shared: true }] },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
  const x = clamp(body.x);
  const y = clamp(body.y);
  if (x === null || y === null) return NextResponse.json({ error: "x and y must be numbers from 0 to 1." }, { status: 400 });
  const z = typeof body.z === "number" && Number.isFinite(body.z) ? Math.max(0, Math.min(100000, Math.round(body.z))) : 0;
  await prisma.stickyNotePlacement.upsert({
    where: { noteId_userId: { noteId: note.id, userId: actor.id } },
    create: { noteId: note.id, userId: actor.id, x, y, z },
    update: { x, y, z },
  });
  return NextResponse.json({ ok: true });
}
