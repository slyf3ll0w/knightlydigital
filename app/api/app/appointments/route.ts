import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";

const validTypes = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"];

/**
 * POST — book a sales meeting / estimate with a client.
 * In-person appointments require an address; default length is 30 minutes.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, requestId, title, type, scheduledAt, scheduledEnd, scheduledAnytime, address, meetingLink, notes } = body;

  if (!contactId || !type || !scheduledAt) {
    return NextResponse.json({ error: "Client, type, and a date are required." }, { status: 400 });
  }
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid appointment type." }, { status: 400 });
  }
  if (type === "IN_PERSON" && !address?.trim()) {
    return NextResponse.json({ error: "In-person appointments need an address." }, { status: 400 });
  }

  // Sales/user can only book against their own leads
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId, contactId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Assignee defaults to whoever books it; managers may pick someone else
  let assignedToId = actor.id;
  if (isManager(actor.role) && body.assignedToId) {
    const target = await prisma.user.findFirst({
      where: { id: body.assignedToId, companyId, isActive: true },
      select: { id: true },
    });
    if (target) assignedToId = target.id;
  }

  const start = new Date(scheduledAt);
  const anytime = Boolean(scheduledAnytime);
  const end = anytime
    ? null
    : scheduledEnd
      ? new Date(scheduledEnd)
      : new Date(start.getTime() + 30 * 60000);

  const appointment = await prisma.appointment.create({
    data: {
      companyId,
      contactId,
      requestId: requestId || null,
      assignedToId,
      title: (title?.trim() || "Estimate").slice(0, 120),
      type,
      scheduledAt: start,
      scheduledEnd: end,
      scheduledAnytime: anytime,
      address: type === "IN_PERSON" ? address.trim().slice(0, 300) : null,
      meetingLink: type === "VIDEO_CALL" && meetingLink?.trim() ? meetingLink.trim().slice(0, 500) : null,
      notes: notes?.trim() ? notes.trim().slice(0, 2000) : null,
    },
  });

  return NextResponse.json(appointment, { status: 201 });
}
