import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { companyTz, serializeTask, taskInclude } from "@/lib/tasks";
import { taskTitleFromBody } from "@/lib/sticky-shared";

/**
 * POST — "Make a task": a Task for the viewer with the note's first line as
 * the title and the rest as notes. The sticky stays on the board.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const note = await prisma.stickyNote.findFirst({
    where: { id, companyId: actor.companyId, archivedAt: null, OR: [{ userId: actor.id }, { shared: true }] },
    select: { id: true, body: true },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const title = taskTitleFromBody(note.body);
  const rest = note.body.trim();
  const task = await prisma.task.create({
    data: {
      companyId: actor.companyId,
      createdById: actor.id,
      assigneeId: actor.id,
      title,
      // Keep the whole note as the task's notes when the title had to be cut
      notes: rest !== title ? rest : null,
    },
    include: taskInclude,
  });
  return NextResponse.json({ task: serializeTask(task, await companyTz(actor.companyId)) }, { status: 201 });
}
