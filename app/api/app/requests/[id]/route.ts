import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";

/**
 * PATCH — update a request's status or details.
 * Body: { status?: "NEW" | "CONVERTED" | "ARCHIVED", title?, details? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const request = await prisma.request.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status && ["NEW", "CONVERTED", "ARCHIVED"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 150);
    if (!title) return NextResponse.json({ error: "The request needs a title." }, { status: 400 });
    data.title = title;
  }
  if (body.details !== undefined) data.details = String(body.details).trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.request.update({ where: { id }, data });
    // Archiving an unapproved self-booking outside the decline route: cancel
    // its tentative appointment too, or it blocks the slot forever
    if (request.status === "NEEDS_APPROVAL" && data.status === "ARCHIVED") {
      await tx.appointment.updateMany({
        where: { requestId: id, companyId, tentative: true, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
    }
    return result;
  });
  return NextResponse.json(updated);
}

/**
 * DELETE — permanently remove a request (spam/marketer cleanup). Refused when
 * quotes or jobs link to it; real work should be archived, not deleted.
 *
 * Spam cascade: when the request's contact is a LEAD whose only footprint was
 * this request (no other requests, no quotes/jobs/invoices/payments/
 * subscriptions/contracts, no live appointments), the lead was created BY the
 * spam — it's deleted too, so no junk card lingers on the pipeline board.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const request = await prisma.request.findFirst({
    where: { id, companyId },
    include: { _count: { select: { quotes: true, jobs: true } } },
  });
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  if (request._count.quotes > 0 || request._count.jobs > 0) {
    return NextResponse.json(
      { error: "This request is linked to quotes or jobs — archive it instead." },
      { status: 400 }
    );
  }

  const leadDeleted = await prisma.$transaction(async (tx) => {
    // A tentative (unapproved) self-booking is meaningless without its
    // request — delete it with the spam so it stops blocking the slot
    await tx.appointment.deleteMany({ where: { requestId: id, companyId, tentative: true } });
    await tx.request.delete({ where: { id } });

    const contact = await tx.contact.findFirst({
      where: { id: request.contactId, companyId, status: "LEAD" },
      include: {
        _count: {
          select: {
            requests: true, quotes: true, jobs: true, invoices: true,
            payments: true, subscriptions: true, contracts: true,
          },
        },
      },
    });
    if (!contact) return false;
    const c = contact._count;
    const hasFootprint =
      c.requests > 0 || c.quotes > 0 || c.jobs > 0 || c.invoices > 0 ||
      c.payments > 0 || c.subscriptions > 0 || c.contracts > 0;
    if (hasFootprint) return false;
    // A declined spam self-booking leaves only a cancelled appointment behind;
    // anything scheduled/completed is real history and keeps the lead.
    const liveAppointments = await tx.appointment.count({
      where: { contactId: contact.id, status: { not: "CANCELLED" } },
    });
    if (liveAppointments > 0) return false;

    await tx.appointment.deleteMany({ where: { contactId: contact.id, companyId } });
    await tx.bookingRequest.deleteMany({ where: { contactId: contact.id, companyId } });
    await tx.reviewRequest.deleteMany({ where: { contactId: contact.id, companyId } });
    await tx.contact.delete({ where: { id: contact.id } }); // notes cascade
    return true;
  });

  return NextResponse.json({ success: true, leadDeleted });
}
