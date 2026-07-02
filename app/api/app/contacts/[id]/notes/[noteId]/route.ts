import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";

async function findNote(
  actor: NonNullable<Awaited<ReturnType<typeof getActor>>>,
  contactId: string,
  noteId: string
) {
  return prisma.contactNote.findFirst({
    where: {
      id: noteId,
      contactId,
      contact: { companyId: actor.companyId, ...contactScope(actor) },
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
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: contactId, noteId } = await params;
  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const note = await findNote(actor, contactId, noteId);
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.userId !== actor.id) {
    return NextResponse.json({ error: "Only the note's author can edit it." }, { status: 403 });
  }

  const updated = await prisma.contactNote.update({
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
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: contactId, noteId } = await params;

  const note = await findNote(actor, contactId, noteId);
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.userId !== actor.id && !isManager(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.contactNote.delete({ where: { id: noteId } });
  return NextResponse.json({ success: true });
}
