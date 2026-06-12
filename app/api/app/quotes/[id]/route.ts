import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";

const allowedStatuses = [
  "DRAFT",
  "AWAITING_RESPONSE",
  "APPROVED",
  "CHANGES_REQUESTED",
  "ARCHIVED",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  const body = await req.json();

  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Full edit (line items present): drafts and sent quotes only. Once the
  // client responds — requested changes or approved — the document they saw
  // is locked; issue a new quote instead.
  if (Array.isArray(body.lineItems)) {
    if (quote.status !== "DRAFT" && quote.status !== "AWAITING_RESPONSE") {
      const reason =
        quote.status === "CHANGES_REQUESTED"
          ? "The client requested changes on this quote — it's locked as they saw it. Create a new quote instead."
          : quote.status === "APPROVED" || quote.status === "CONVERTED"
            ? "Approved quotes are locked — the client signed off on this exact document."
            : "Archived quotes can't be edited.";
      return NextResponse.json({ error: reason }, { status: 400 });
    }
    if (body.lineItems.length === 0) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }

    const lineItems = body.lineItems as {
      name?: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number | null;
      isOptional?: boolean;
              requiresAgreement?: boolean;
      sortOrder?: number;
    }[];
    const subtotal = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unitPrice || 0), 0);
    const discountType =
      body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
    const discountValue = Number(body.discountValue) || 0;
    const discount =
      discountType === "PERCENT"
        ? Math.round(subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100
        : discountType === "FIXED"
          ? Math.min(Math.max(discountValue, 0), subtotal)
          : 0;
    const taxRate = Number(body.taxRate) || null;
    const tax = taxRate ? (subtotal - discount) * taxRate : null;
    const total = subtotal - discount + (tax ?? 0);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.quoteLineItem.deleteMany({ where: { quoteId: quote.id } });
      return tx.quote.update({
        where: { id: quote.id },
        data: {
          title: body.title || null,
          subtotal,
          discountType,
          discountValue: discount > 0 ? discountValue : null,
          discount: discount > 0 ? discount : null,
          taxRate,
          tax,
          total,
          depositType:
            body.depositType === "PERCENT" || body.depositType === "FIXED"
              ? body.depositType
              : "NONE",
          depositValue: body.depositValue ?? null,
          clientMessage: body.clientMessage || null,
          disclaimer: body.disclaimer || null,
          lineItems: {
            create: lineItems.map((li, i) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              unitCost: li.unitCost ?? null,
              total: li.quantity * li.unitPrice,
              isOptional: li.isOptional ?? false,
              requiresAgreement: li.requiresAgreement ?? false,
              sortOrder: li.sortOrder ?? i,
            })),
          },
        },
      });
    });
    return NextResponse.json(updated);
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.status === "AWAITING_RESPONSE" && !quote.sentAt && { sentAt: new Date() }),
      ...(body.status === "APPROVED" && { approvedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  // Converted quotes can go too — the job it became stays
  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
