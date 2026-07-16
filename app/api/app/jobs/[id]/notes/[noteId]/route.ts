import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope, isManager } from "@/lib/permissions";
import type { Actor } from "@/lib/permissions";

async function findNote(actor: Actor, jobId: string, noteId: string) {
  return prisma.jobNote.findFirst({
    where: {
      id: noteId,
      jobId,
      job: { companyId: actor.companyId, ...jobScope(actor) },
    },
  });
}

/** PATCH — edit a note's text. Only the note's author can edit. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId, noteId } = await params;
  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const note = await findNote(actor, jobId, noteId);
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.userId !== actor.id) {
    return NextResponse.json({ error: "Only the note's author can edit it." }, { status: 403 });
  }

  const updated = await prisma.jobNote.update({
    where: { id: noteId },
    data: { body: String(body).trim().slice(0, 5000) },
  });
  return NextResponse.json(updated);
}

/** DELETE — remove a note. The author or a manager can delete. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId, noteId } = await params;

  const note = await findNote(actor, jobId, noteId);
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.userId !== actor.id && !isManager(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.jobNote.delete({ where: { id: noteId } });
  return NextResponse.json({ success: true });
}
