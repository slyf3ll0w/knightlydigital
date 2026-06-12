import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

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

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
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
  // Discount comes off the subtotal before tax (mirrors invoices)
  const discountType =
    body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
  const discountValue = Number(body.discountValue) || 0;
  const discount =
    discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100
      : discountType === "FIXED"
        ? Math.min(Math.max(discountValue, 0), subtotal)
        : 0;
  const taxable = subtotal - discount;
  const tax = taxRate ? taxable * taxRate : null;
  const total = taxable + (tax ?? 0);

  const quote = await prisma.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        quoteNumber,
        title: title || null,
        subtotal,
        discountType,
        discountValue: discount > 0 ? discountValue : null,
        discount: discount > 0 ? discount : null,
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
