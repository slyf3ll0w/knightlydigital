import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contactId, jobId, lineItems, taxRate, notes, dueDate } = body;

  if (!lineItems?.length) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }

  const last = await prisma.invoice.findFirst({
    where: { companyId },
    orderBy: { invoiceNumber: "desc" },
  });
  const invoiceNumber = (last?.invoiceNumber ?? 0) + 1;

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  const tax = taxRate ? subtotal * taxRate : null;
  const total = subtotal + (tax ?? 0);

  const invoice = await prisma.invoice.create({
    data: {
      companyId,
      contactId: contactId || null,
      jobId: jobId || null,
      invoiceNumber,
      subtotal,
      taxRate: taxRate || null,
      tax,
      total,
      notes: notes || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      lineItems: {
        create: lineItems.map((li: { description: string; quantity: number; unitPrice: number; sortOrder: number }) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          total: li.quantity * li.unitPrice,
          sortOrder: li.sortOrder ?? 0,
        })),
      },
    },
  });

  // Update job status to INVOICED if linked
  if (jobId) {
    await prisma.job.updateMany({
      where: { id: jobId, companyId },
      data: { status: "INVOICED" },
    });
  }

  return NextResponse.json(invoice, { status: 201 });
}
