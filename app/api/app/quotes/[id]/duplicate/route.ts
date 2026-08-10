import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { withDocNumberRetry } from "@/lib/doc-numbers";

/**
 * POST — duplicate a quote into a fresh DRAFT: same client, line items,
 * discount/tax/deposit, messages. No sent/approval history, new number, new
 * public token. The highest-frequency shortcut in field service ("same job
 * as the Hendersons").
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const source = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const last = await tx.quote.findFirst({
        where: { companyId },
        orderBy: { quoteNumber: "desc" },
        select: { quoteNumber: true },
      });
      return tx.quote.create({
        data: {
          companyId,
          contactId: source.contactId,
          quoteNumber: (last?.quoteNumber ?? 0) + 1,
          title: source.title,
          status: "DRAFT",
          subtotal: source.subtotal,
          discountType: source.discountType,
          discountValue: source.discountValue,
          discount: source.discount,
          taxRate: source.taxRate,
          tax: source.tax,
          total: source.total,
          depositType: source.depositType,
          depositValue: source.depositValue,
          clientMessage: source.clientMessage,
          disclaimer: source.disclaimer,
          notes: source.notes,
          lineItems: {
            create: source.lineItems.map((li, i) => ({
              name: li.name,
              description: li.description,
              quantity: li.quantity,
              unitCost: li.unitCost,
              unitPrice: li.unitPrice,
              total: li.total,
              isOptional: li.isOptional,
              // A fresh quote starts with every optional item included
              optedOut: false,
              requiresAgreement: li.requiresAgreement,
              workItemId: li.workItemId,
              recurringInterval: li.recurringInterval,
              sortOrder: i,
            })),
          },
        },
        select: { id: true, quoteNumber: true },
      });
    })
  );

  return NextResponse.json(created, { status: 201 });
}
