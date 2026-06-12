import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Reassigning a lead is a manager action
  let assignment: { assignedToId: string | null } | undefined;
  if (isManager(actor.role) && body.assignedToId !== undefined) {
    if (body.assignedToId === null || body.assignedToId === "") {
      assignment = { assignedToId: null };
    } else {
      const target = await prisma.user.findFirst({
        where: { id: body.assignedToId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 400 });
      assignment = { assignedToId: target.id };
    }
  }

  const contact = await prisma.contact.updateMany({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    data: {
      ...(body.firstName !== undefined && {
        firstName: body.firstName,
        lastName: body.lastName,
        companyName: body.companyName || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        notes: body.notes || null,
      }),
      ...assignment,
    },
  });

  if (contact.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

/**
 * DELETE — permanently remove a contact (spam/marketer cleanup). Refused when
 * the contact has any real work (quotes, jobs, invoices, payments, plans);
 * their requests and booking submissions are spam artifacts and go with them.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const companyId = actor.companyId;

  const contact = await prisma.contact.findFirst({
    where: { id, companyId },
    include: {
      _count: {
        select: { quotes: true, jobs: true, invoices: true, payments: true, servicePlans: true },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = contact._count;
  if (c.quotes > 0 || c.jobs > 0 || c.invoices > 0 || c.payments > 0 || c.servicePlans > 0) {
    return NextResponse.json(
      { error: "This client has quotes, jobs, or billing history — archive them instead." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.request.deleteMany({ where: { contactId: id, companyId } }),
    prisma.bookingRequest.deleteMany({ where: { contactId: id, companyId } }),
    prisma.contact.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
