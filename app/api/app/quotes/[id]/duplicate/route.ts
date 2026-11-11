import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { nextQuoteNumber, withDocNumberRetry } from "@/lib/doc-numbers";
import { computeQuoteTotals } from "@/lib/quote-totals";

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

  // Totals from the lines the copy actually carries. The source's stored
  // totals leave out optional items its client declined, but the copy starts
  // with every optional item included — it listed $1,500 of work under a
  // $1,000 total.
  const subtotal = Math.round(source.lineItems.reduce((s, li) => s + Number(li.total), 0) * 100) / 100;
  const totals = computeQuoteTotals({
    subtotal,
    discountType: source.discountType,
    discountValue: source.discountValue == null ? null : Number(source.discountValue),
    taxRate: source.taxRate == null ? null : Number(source.taxRate),
  });

  const created = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const quoteNumber = await nextQuoteNumber(tx, companyId);
      return tx.quote.create({
        data: {
          companyId,
          contactId: source.contactId,
          // The client link: a real random token, not the schema's cuid default
          publicToken: randomBytes(24).toString("hex"),
          quoteNumber,
          title: source.title,
          status: "DRAFT",
          subtotal,
          discountType: source.discountType,
          discountValue: source.discountValue,
          discount: totals.discount,
          taxRate: source.taxRate,
          tax: totals.tax,
          total: totals.total,
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
