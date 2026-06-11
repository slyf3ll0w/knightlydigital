import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

async function getCompanyId() {
  const session = await getServerSession(authOptions);
  return session?.user.companyId ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const contact = await prisma.contact.updateMany({
    where: { id, companyId },
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      notes: body.notes || null,
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
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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
