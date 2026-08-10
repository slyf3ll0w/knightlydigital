import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { withDocNumberRetry } from "@/lib/doc-numbers";

/**
 * POST — duplicate an invoice into a fresh DRAFT: same client, line items,
 * discount/tax, messages. No payments, no job link, no deposit credit — those
 * belong to the original transaction. New number + public token.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const source = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  // The copy re-derives its total WITHOUT the source's deposit credit
  const gross =
    Number(source.subtotal) - Number(source.discount ?? 0) + Number(source.tax ?? 0);

  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const last = await tx.invoice.findFirst({
        where: { companyId },
        orderBy: { invoiceNumber: "desc" },
        select: { invoiceNumber: true },
      });
      return tx.invoice.create({
        data: {
          companyId,
          contactId: source.contactId,
          publicToken: randomBytes(24).toString("hex"),
          invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
          kind: "STANDARD",
          subject: source.subject,
          status: "DRAFT",
          subtotal: source.subtotal,
          discountType: source.discountType,
          discountValue: source.discountValue,
          discount: source.discount,
          taxRate: source.taxRate,
          tax: source.tax,
          total: Math.round(gross * 100) / 100,
          notes: source.notes,
          clientMessage: source.clientMessage,
          lineItems: {
            create: source.lineItems.map((li, i) => ({
              name: li.name,
              description: li.description,
              quantity: li.quantity,
              unitCost: li.unitCost,
              unitPrice: li.unitPrice,
              total: li.total,
              workItemId: li.workItemId,
              recurringInterval: li.recurringInterval,
              sortOrder: i,
            })),
          },
        },
        select: { id: true, invoiceNumber: true },
      });
    })
  );

  return NextResponse.json(created, { status: 201 });
}
