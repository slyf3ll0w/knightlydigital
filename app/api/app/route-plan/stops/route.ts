import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";
import { findPlace } from "@/lib/places";
import { minuteField } from "@/lib/route-stop-input";
import { DEFAULT_ERRAND_MINUTES, DEFAULT_TASK_STOP_MINUTES, parseRouteDate } from "@/lib/route-plan";
import { wallTimeToUtc } from "@/lib/booking-engine";
import { checkFeature } from "@/lib/plan-gate";
import { companyTz, serializeTask, taskInclude, taskScope } from "@/lib/tasks";

/**
 * POST /api/app/route-plan/stops — "Add a stop" to someone's day from the
 * Routes page or the phone. One call, three shapes:
 *
 *   { date, userId, kind: "errand", title?, placeId? | address?, durationMinutes?,
 *     floatAfterMin?, floatBeforeMin?, beforeJobId?, at?: "HH:mm" }
 *       → an ERRAND time block. Flexible (Optimize places it) unless `at`
 *         names a fixed time.
 *   { date, userId, kind: "break", durationMinutes?, floatAfterMin?, floatBeforeMin? }
 *       → a BREAK block inside its window (defaults: the company's lunch).
 *   { date, userId, kind: "task", taskId?, title?, placeId? | address?, durationMinutes? }
 *       → an existing task gets the place + that due day (all-day, so
 *         Optimize slots it), or a new task is made for that person.
 *
 * Who may: managers + USER for anyone, everyone for themselves. Part of
 * Route Manager (same gate as the page).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await checkFeature(actor.companyId, "routes");
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const userId = typeof body.userId === "string" && body.userId ? body.userId : actor.id;
  const dispatcher = isManager(actor.role) || actor.role === "USER";
  if (userId !== actor.id && !dispatcher) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const member = await prisma.user.findFirst({
    where: { id: userId, companyId: actor.companyId, isActive: true },
    select: { id: true, name: true },
  });
  if (!member) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true, breakMinutes: true, breakAfterMin: true, breakBeforeMin: true },
  });
  const tz = company?.timezone || "America/Chicago";
  const date = parseRouteDate(typeof body.date === "string" ? body.date : null, tz);
  const onDay = (min: number) => wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), min);

  const kind = typeof body.kind === "string" ? body.kind : "errand";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const duration = Number.isInteger(Number(body.durationMinutes)) && Number(body.durationMinutes) >= 5 && Number(body.durationMinutes) <= 12 * 60
    ? Number(body.durationMinutes)
    : null;

  // Where: a saved place (address + pin copied), else a typed address (geocoded)
  const place = typeof body.placeId === "string" && body.placeId ? await findPlace(actor.companyId, body.placeId) : null;
  if (typeof body.placeId === "string" && body.placeId && !place) return NextResponse.json({ error: "That place doesn't exist." }, { status: 400 });
  const typed = typeof body.address === "string" ? body.address.trim().slice(0, 240) : "";
  const address = typed || place?.address || null;
  const pin = place && address === place.address ? { lat: place.lat, lng: place.lng } : address ? await geocodeAddress(address, actor.companyId) : null;

  const after = minuteField(body.floatAfterMin);
  const before = minuteField(body.floatBeforeMin);
  if (after === "error" || before === "error") return NextResponse.json({ error: "The window isn't valid." }, { status: 400 });
  if (after != null && before != null && before <= after) return NextResponse.json({ error: "The window has to end after it starts." }, { status: 400 });

  if (kind === "break") {
    const minutes = duration ?? (company?.breakMinutes || 30);
    const floatAfter = after ?? company?.breakAfterMin ?? 11 * 60 + 30;
    const floatBefore = before ?? company?.breakBeforeMin ?? 13 * 60;
    const start = onDay(floatAfter);
    const block = await prisma.timeBlock.create({
      data: {
        companyId: actor.companyId,
        userId: member.id,
        createdById: actor.id,
        title: title || "Lunch",
        kind: "BREAK",
        flexible: true,
        floatAfterMin: floatAfter,
        floatBeforeMin: floatBefore,
        startAt: start,
        endAt: new Date(start.getTime() + minutes * 60000),
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, kind: "break", id: block.id }, { status: 201 });
  }

  if (kind === "task") {
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const minutes = duration ?? DEFAULT_TASK_STOP_MINUTES;
    if (!address) return NextResponse.json({ error: "Pick a place or type an address." }, { status: 400 });
    const placeFields = { address, lat: pin?.lat ?? null, lng: pin?.lng ?? null, placeId: place?.id ?? null, estimatedMinutes: minutes };
    const dueAt = onDay(0);
    if (taskId) {
      const existing = await prisma.task.findFirst({ where: { id: taskId, companyId: actor.companyId, ...taskScope(actor) }, select: { id: true, assigneeId: true } });
      if (!existing) return NextResponse.json({ error: "That task doesn't exist." }, { status: 404 });
      if (existing.assigneeId !== member.id && !isManager(actor.role)) {
        return NextResponse.json({ error: "Only owners and admins can give tasks to others." }, { status: 403 });
      }
      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { ...placeFields, dueAt, allDay: true, assigneeId: member.id },
        include: taskInclude,
      });
      return NextResponse.json({ ok: true, kind: "task", id: updated.id, task: serializeTask(updated, await companyTz(actor.companyId)) }, { status: 200 });
    }
    if (!title) return NextResponse.json({ error: "Give the task a title." }, { status: 400 });
    if (member.id !== actor.id && !isManager(actor.role)) {
      return NextResponse.json({ error: "Only owners and admins can give tasks to others." }, { status: 403 });
    }
    const created = await prisma.task.create({
      data: {
        companyId: actor.companyId,
        createdById: actor.id,
        assigneeId: member.id,
        title,
        dueAt,
        allDay: true,
        ...placeFields,
      },
      include: taskInclude,
    });
    return NextResponse.json({ ok: true, kind: "task", id: created.id, task: serializeTask(created, await companyTz(actor.companyId)) }, { status: 201 });
  }

  // Errand (the default)
  if (!address) return NextResponse.json({ error: "Pick a place or type an address." }, { status: 400 });
  const minutes = duration ?? DEFAULT_ERRAND_MINUTES;
  const at = minuteField(body.at);
  if (at === "error") return NextResponse.json({ error: "That time isn't valid." }, { status: 400 });
  let beforeJobId: string | null = null;
  if (typeof body.beforeJobId === "string" && body.beforeJobId) {
    const job = await prisma.job.findFirst({ where: { id: body.beforeJobId, companyId: actor.companyId }, select: { id: true } });
    if (!job) return NextResponse.json({ error: "That job doesn't exist." }, { status: 400 });
    beforeJobId = job.id;
  }
  const fixed = at != null;
  // A flexible errand's placeholder time is the start of its window (or
  // 8 AM) — the calendar shows it there as "Anytime" until Optimize places it
  const start = onDay(fixed ? at : after ?? 8 * 60);
  const block = await prisma.timeBlock.create({
    data: {
      companyId: actor.companyId,
      userId: member.id,
      createdById: actor.id,
      title: title || place?.name || "Errand",
      kind: "ERRAND",
      flexible: !fixed,
      floatAfterMin: fixed ? null : after,
      floatBeforeMin: fixed ? null : before,
      beforeJobId,
      placeId: place?.id ?? null,
      address,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      startAt: start,
      endAt: new Date(start.getTime() + minutes * 60000),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, kind: "errand", id: block.id, pinned: pin?.lat != null }, { status: 201 });
}
