import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    contactId,
    requestId,
    title,
    lineItems,
    taxRate,
    depositType,
    depositValue,
    clientMessage,
    disclaimer,
    notes,
    validUntil,
  } = body;

  if (!contactId || !lineItems?.length) {
    return NextResponse.json(
      { error: "Client and at least one line item are required." },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

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

  const quote = await prisma.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        quoteNumber,
        title: title || null,
        subtotal,
        taxRate: taxRate || null,
        tax,
        total,
        depositType: depositType === "PERCENT" || depositType === "FIXED" ? depositType : "NONE",
        depositValue: depositValue ?? null,
        clientMessage: clientMessage || null,
        disclaimer: disclaimer || null,
        notes: notes || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        lineItems: {
          create: lineItems.map(
            (li: {
              name?: string;
              description: string;
              quantity: number;
              unitPrice: number;
              unitCost?: number | null;
              isOptional?: boolean;
              sortOrder?: number;
            }) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              unitCost: li.unitCost ?? null,
              total: li.quantity * li.unitPrice,
              isOptional: li.isOptional ?? false,
              sortOrder: li.sortOrder ?? 0,
            })
          ),
        },
      },
    });

    // Converting a request to a quote marks the request Converted (Jobber behavior)
    if (requestId) {
      await tx.request.update({ where: { id: requestId }, data: { status: "CONVERTED" } });
    }

    return created;
  });

  return NextResponse.json(quote, { status: 201 });
}
