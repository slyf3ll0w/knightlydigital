import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { companyTz, serializeTask, taskInclude, taskScope } from "@/lib/tasks";

/** POST { done: boolean } — tick a task off (or back on). The quick path from
 *  the list's circle and the dashboard. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.task.findFirst({
    where: { id, companyId: actor.companyId, ...taskScope(actor) },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { done?: unknown };
  const done = body.done !== false;
  const updated = await prisma.task.update({
    where: { id },
    data: done ? { doneAt: new Date(), doneById: actor.id } : { doneAt: null, doneById: null },
    include: taskInclude,
  });
  const tz = await companyTz(actor.companyId);
  return NextResponse.json({ task: serializeTask(updated, tz) });
}
