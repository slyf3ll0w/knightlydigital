import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contactId, jobId, lineItems, taxRate, notes, validUntil } = body;

  if (!contactId || !lineItems?.length) {
    return NextResponse.json({ error: "Contact and at least one line item are required." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const last = await prisma.quote.findFirst({
    where: { companyId },
    orderBy: { quoteNumber: "desc" },
  });
  const quoteNumber = (last?.quoteNumber ?? 0) + 1;

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  const tax = taxRate ? subtotal * taxRate : null;
  const total = subtotal + (tax ?? 0);

  const quote = await prisma.quote.create({
    data: {
      companyId,
      contactId,
      jobId: jobId || null,
      quoteNumber,
      subtotal,
      taxRate: taxRate || null,
      tax,
      total,
      notes: notes || null,
      validUntil: validUntil ? new Date(validUntil) : null,
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

  return NextResponse.json(quote, { status: 201 });
}
