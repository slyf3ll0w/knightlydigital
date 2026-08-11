import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import {
  backfillLineItemCosts,
  deriveLineItemAgreements,
  intQuantity,
  unitPriceValue,
} from "@/lib/work-items";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";
import { withDocNumberRetry } from "@/lib/doc-numbers";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  if (await inPreview(companyId)) {
    const n = await prisma.quote.count({ where: { companyId } });
    if (n >= PREVIEW_CAP) return NextResponse.json(previewCapError("quotes"), { status: 403 });
  }

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
  for (const li of lineItems) {
    li.quantity = intQuantity(li.quantity);
    li.unitPrice = unitPriceValue(li.unitPrice);
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (requestId) {
    const request = await prisma.request.findFirst({ where: { id: requestId, companyId } });
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Saved service address (property) — must belong to this contact; carried
  // onto the job at convert time so multi-property clients group correctly
  const property =
    typeof body.propertyId === "string" && body.propertyId
      ? await prisma.contactAddress.findFirst({
          where: { id: body.propertyId, contactId },
          select: { id: true },
        })
      : null;

  // Hand-typed line items matching a price-book name inherit its cost so
  // profit margins stay honest (picker-selected items already carry it)
  type QuoteLineInput = {
    name?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number | null;
    isOptional?: boolean;
    requiresAgreement?: boolean;
    workItemId?: string | null;
    recurringInterval?: RecurringInterval | null;
    sortOrder?: number;
  };
  const costedLineItems = await deriveLineItemAgreements(
    companyId,
    await backfillLineItemCosts(companyId, lineItems as QuoteLineInput[])
  );

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  // Discount comes off the subtotal before tax (mirrors invoices)
  const discountType =
    body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
  const discountValue = Number(body.discountValue) || 0;
  const { discount, tax, total } = computeQuoteTotals({
    subtotal,
    discountType,
    discountValue,
    taxRate: taxRate || null,
  });

  // Number derived inside the retried transaction so two people quoting at
  // the same time both succeed instead of one hitting a unique violation.
  const quote = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    const last = await tx.quote.findFirst({
      where: { companyId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true },
    });

    const created = await tx.quote.create({
      data: {
        companyId,
        contactId,
        requestId: requestId || null,
        propertyId: property?.id ?? null,
        publicToken: randomBytes(24).toString("hex"),
        quoteNumber: (last?.quoteNumber ?? 0) + 1,
        title: title || null,
        subtotal,
        discountType,
        discountValue: discount > 0 ? discountValue : null,
        discount: discount > 0 ? discount : null,
        taxRate: taxRate || null,
        tax,
        total,
        depositType:
          depositType === "PERCENT" || depositType === "FIXED" || depositType === "FULL"
            ? depositType
            : "NONE",
        depositValue: depositType === "PERCENT" || depositType === "FIXED" ? depositValue ?? null : null,
        clientMessage: clientMessage || null,
        disclaimer: disclaimer || null,
        notes: notes || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        lineItems: {
          create: costedLineItems.map(
            (li) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              unitCost: li.unitCost ?? null,
              total: li.quantity * li.unitPrice,
              isOptional: li.isOptional ?? false,
              requiresAgreement: li.requiresAgreement ?? false,
              workItemId: li.workItemId ?? null,
              recurringInterval: li.recurringInterval ?? null,
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
  }));

  return NextResponse.json(quote, { status: 201 });
}
