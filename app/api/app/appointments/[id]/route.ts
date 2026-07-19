import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, appointmentScope } from "@/lib/permissions";

const validTypes = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"];
const validStatuses = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"];

/**
 * PATCH — update an appointment: status, reschedule (incl. calendar drag),
 * or edit details. Visibility follows appointmentScope.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const appt = await prisma.appointment.findFirst({
    where: { id, companyId: actor.companyId, ...appointmentScope(actor) },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    data.completedAt = body.status === "COMPLETED" ? new Date() : null;
  }
  if (body.title !== undefined) data.title = (String(body.title).trim() || "Estimate").slice(0, 120);
  if (body.type !== undefined) {
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: "Invalid appointment type." }, { status: 400 });
    }
    data.type = body.type;
  }
  const nextType = (data.type ?? appt.type) as string;
  if (body.address !== undefined) {
    data.address = body.address?.trim() ? String(body.address).trim().slice(0, 300) : null;
  }
  if (nextType === "IN_PERSON" && (data.address === null || (body.address === undefined && !appt.address))) {
    return NextResponse.json({ error: "In-person appointments need an address." }, { status: 400 });
  }
  if (body.meetingLink !== undefined) {
    data.meetingLink = body.meetingLink?.trim() ? String(body.meetingLink).trim().slice(0, 500) : null;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes?.trim() ? String(body.notes).trim().slice(0, 2000) : null;
  }
  if (body.scheduledAt !== undefined) {
    if (!body.scheduledAt) return NextResponse.json({ error: "A date is required." }, { status: 400 });
    const start = new Date(body.scheduledAt);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    data.scheduledAt = start;
  }
  if (body.scheduledEnd !== undefined) {
    if (body.scheduledEnd) {
      const end = new Date(body.scheduledEnd);
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
      }
      data.scheduledEnd = end;
    } else {
      data.scheduledEnd = null;
    }
  }
  const nextStart = (data.scheduledAt ?? appt.scheduledAt) as Date;
  const nextEnd = ("scheduledEnd" in data ? data.scheduledEnd : appt.scheduledEnd) as Date | null;
  if (nextEnd && nextEnd.getTime() <= nextStart.getTime()) {
    return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
  }
  if (body.scheduledAnytime !== undefined) data.scheduledAnytime = Boolean(body.scheduledAnytime);

  if (body.assignedToId !== undefined && isManager(actor.role)) {
    if (!body.assignedToId) {
      data.assignedToId = null;
    } else {
      const target = await prisma.user.findFirst({
        where: { id: body.assignedToId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 400 });
      data.assignedToId = target.id;
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true });

  const updated = await prisma.appointment.update({ where: { id: appt.id }, data });
  return NextResponse.json(updated);
}

/** DELETE — remove an appointment entirely (managers; others cancel instead). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const appt = await prisma.appointment.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.appointment.delete({ where: { id: appt.id } });
  return NextResponse.json({ success: true });
}
