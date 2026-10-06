import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import {
  companyTz,
  finishReminder,
  notifyTaskAssigned,
  serializeTask,
  taskInclude,
  taskScope,
  validateTaskInput,
} from "@/lib/tasks";

/**
 * GET / PATCH / DELETE one task. Managers may touch any task in the company;
 * everyone else only their own. Reassigning (managers) pushes the new person.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.task.findFirst({
    where: { id, companyId: actor.companyId, ...taskScope(actor) },
    include: taskInclude,
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tz = await companyTz(actor.companyId);
  return NextResponse.json({ task: serializeTask(task, tz) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.task.findFirst({ where: { id, companyId: actor.companyId, ...taskScope(actor) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const tz = await companyTz(actor.companyId);

  const validated = await validateTaskInput(body, actor.companyId, tz, { requireTitle: false });
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
  const data = finishReminder(validated.data, validated.pending, existing, tz);

  // Reassignment (managers only)
  let assigneeId: string | undefined;
  if (typeof body.assigneeId === "string" && body.assigneeId && body.assigneeId !== existing.assigneeId) {
    if (!isManager(actor.role)) {
      return NextResponse.json({ error: "Only owners and admins can give tasks to others." }, { status: 403 });
    }
    const target = await prisma.user.findFirst({
      where: { id: body.assigneeId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    assigneeId = target.id;
  }

  // Done flag (the /done route is the quick path; this covers the editor)
  let doneFields: { doneAt: Date | null; doneById: string | null } | undefined;
  if (typeof body.done === "boolean" && body.done !== Boolean(existing.doneAt)) {
    doneFields = body.done ? { doneAt: new Date(), doneById: actor.id } : { doneAt: null, doneById: null };
  }

  // A reminder whose moment changed should fire again; one already sent for
  // an unchanged time stays sent.
  const remindReset =
    data.remindAt !== undefined && (data.remindAt?.getTime() ?? null) !== (existing.remindAt?.getTime() ?? null)
      ? { remindSentAt: null }
      : {};

  const updated = await prisma.task.update({
    where: { id },
    data: { ...data, ...(assigneeId ? { assigneeId } : {}), ...doneFields, ...remindReset },
    include: taskInclude,
  });
  if (assigneeId) await notifyTaskAssigned(updated, actor, tz);
  return NextResponse.json({ task: serializeTask(updated, tz) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.task.findFirst({
    where: { id, companyId: actor.companyId, ...taskScope(actor) },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
