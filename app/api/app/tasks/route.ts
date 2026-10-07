import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { checkFeature, featureAllowedFor } from "@/lib/plan-gate";
import {
  companyTz,
  finishReminder,
  listTasks,
  notifyTaskAssigned,
  parseTaskView,
  reminderSentStamp,
  serializeTask,
  taskInclude,
  validateTaskInput,
} from "@/lib/tasks";

/**
 * GET — the actor's tasks. ?view=mine (default) | team (managers: everyone's
 * open tasks) | done (finished, newest first, last 90 days).
 * POST — create. `assigneeIds` (managers) makes one task per person; everyone
 * else gets themselves. Each assignee who isn't the creator is pushed.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The team view is part of the task_assign Pro feature (dark until PLAN_GATING=1)
  const teamView = isManager(actor.role) && (await featureAllowedFor(actor.companyId, "task_assign"));
  const view = parseTaskView(req.nextUrl.searchParams.get("view"), teamView);
  const tz = await companyTz(actor.companyId);
  return NextResponse.json({ tasks: await listTasks(actor, view, tz), tz });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const tz = await companyTz(actor.companyId);

  const validated = await validateTaskInput(body, actor, tz, { requireTitle: true });
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
  const data = finishReminder(validated.data, validated.pending, { dueAt: null, allDay: true }, tz);
  // A reminder already in the past is stamped sent, not fired as stale
  const remindSentAt = reminderSentStamp(data.remindAt, new Date());

  // Assignees: self unless a manager names others
  let assigneeIds = [actor.id];
  const raw = Array.isArray(body.assigneeIds)
    ? body.assigneeIds
    : typeof body.assigneeId === "string"
      ? [body.assigneeId]
      : null;
  if (raw) {
    const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0))].slice(0, 50);
    if (ids.length === 0) return NextResponse.json({ error: "Pick who this task is for." }, { status: 400 });
    if (ids.some((id) => id !== actor.id)) {
      if (!isManager(actor.role)) {
        return NextResponse.json({ error: "Only owners and admins can give tasks to others." }, { status: 403 });
      }
      // Dark until PLAN_GATING=1 (lib/plan-gate.ts)
      const gate = await checkFeature(actor.companyId, "task_assign");
      if (!gate.ok) return gate.response;
      const found = await prisma.user.findMany({
        where: { id: { in: ids }, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (found.length !== ids.length) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }
    assigneeIds = ids;
  }

  const created = await prisma.$transaction(
    assigneeIds.map((assigneeId) =>
      prisma.task.create({
        data: {
          companyId: actor.companyId,
          createdById: actor.id,
          assigneeId,
          title: data.title!,
          notes: data.notes ?? null,
          dueAt: data.dueAt ?? null,
          allDay: data.allDay ?? true,
          remindAt: data.remindAt ?? null,
          remindSentAt,
          priority: data.priority ?? "NORMAL",
          contactId: data.contactId ?? null,
          jobId: data.jobId ?? null,
          quoteId: data.quoteId ?? null,
          invoiceId: data.invoiceId ?? null,
          callId: data.callId ?? null,
        },
        include: taskInclude,
      })
    )
  );

  await Promise.all(created.map((t) => notifyTaskAssigned(t, actor, tz)));
  const now = new Date();
  return NextResponse.json({ tasks: created.map((t) => serializeTask(t, tz, now)) }, { status: 201 });
}
