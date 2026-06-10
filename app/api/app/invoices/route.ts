import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contactId, jobId, subject, lineItems, taxRate, notes, dueDate } = body;

  if (!lineItems?.length) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }

  const contact = contactId
    ? await prisma.contact.findFirst({ where: { id: contactId, companyId } })
    : null;

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  const tax = taxRate ? subtotal * taxRate : null;
  const total = subtotal + (tax ?? 0);

  // Due date from explicit value, else the client's payment terms (Net N)
  const issuedAt = new Date();
  const due = dueDate
    ? new Date(dueDate)
    : contact
      ? new Date(issuedAt.getTime() + contact.paymentTermsDays * 86400000)
      : null;

  const invoice = await prisma.$transaction(async (tx) => {
    const last = await tx.invoice.findFirst({
      where: { companyId },
      orderBy: { invoiceNumber: "desc" },
    });

    const created = await tx.invoice.create({
      data: {
        companyId,
        contactId: contactId || null,
        jobId: jobId || null,
        invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
        subject: subject || null,
        subtotal,
        taxRate: taxRate || null,
        tax,
        total,
        notes: notes || null,
        issuedAt,
        dueDate: due,
        lineItems: {
          create: lineItems.map(
            (li: {
              name?: string;
              description: string;
              quantity: number;
              unitPrice: number;
              serviceDate?: string;
              sortOrder?: number;
            }) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              total: li.quantity * li.unitPrice,
              serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
              sortOrder: li.sortOrder ?? 0,
            })
          ),
        },
      },
    });

    // Invoicing a completed job resolves its "requires invoicing" state
    if (jobId) {
      const job = await tx.job.findFirst({ where: { id: jobId, companyId } });
      if (job?.status === "REQUIRES_INVOICING") {
        await tx.job.update({
          where: { id: jobId },
          data: { status: "ARCHIVED", closedAt: new Date() },
        });
      }
    }

    if (contact?.status === "LEAD") {
      await tx.contact.update({ where: { id: contact.id }, data: { status: "ACTIVE" } });
    }

    return created;
  });

  return NextResponse.json(invoice, { status: 201 });
}
