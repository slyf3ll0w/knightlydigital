import { NextRequest, NextResponse } from "next/server";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import {
  backfillLineItemCosts,
  deriveLineItemAgreements,
  intQuantity,
  unitPriceValue,
} from "@/lib/work-items";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { queueQuickBooksUnwind } from "@/lib/quickbooks";
import { autoAdvance } from "@/lib/pipeline";
import { logActivity } from "@/lib/activity";
import { sanitizeDeposit, syncDepositInvoice } from "@/lib/deposits";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { APPROVABLE_STATUSES, finishQuoteApproval } from "@/lib/quote-approval";

const allowedStatuses = [
  "DRAFT",
  "AWAITING_RESPONSE",
  "APPROVED",
  "CHANGES_REQUESTED",
  "ARCHIVED",
] as const;

/** Accept an ISO string (or null/garbage → null) for the expiry date. */
function parseValidUntil(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

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

  // Saved service address link — validated against the quote's contact.
  // Only applied on full edits (the editor always sends it there).
  const propertyId =
    typeof body.propertyId === "string" && body.propertyId
      ? (
          await prisma.contactAddress.findFirst({
            where: { id: body.propertyId, contactId: quote.contactId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

  // Transition guard: client sign-off can't be quietly rewound. Approved
  // quotes only move to ARCHIVED (or CONVERTED via the convert route);
  // converted quotes never change status here.
  if (body.status && body.status !== quote.status) {
    if (quote.status === "CONVERTED") {
      return NextResponse.json(
        { error: "This quote was converted to a job — its status is locked." },
        { status: 400 }
      );
    }
    if (quote.status === "APPROVED" && body.status !== "ARCHIVED") {
      return NextResponse.json(
        { error: "The client approved this quote — it can only be archived, not reverted." },
        { status: 400 }
      );
    }
    // "Mark Approved" records a sign-off the client gave in person or by
    // phone — on a quote they were actually shown. A draft nobody sent or an
    // archived quote has nothing to approve.
    if (
      body.status === "APPROVED" &&
      !(APPROVABLE_STATUSES as readonly string[]).includes(quote.status)
    ) {
      return NextResponse.json(
        {
          error:
            quote.status === "DRAFT"
              ? "Send the quote (or mark it as sent) before marking it approved."
              : "Archived quotes can't be approved — reopen it first.",
        },
        { status: 400 }
      );
    }
  }

  // Full edit (line items present): allowed until the client signs off —
  // drafts, sent quotes, and change requests (that's the whole point of a
  // change request). Approved/converted quotes are locked as signed.
  if (Array.isArray(body.lineItems)) {
    const editableStatuses = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"];
    if (!editableStatuses.includes(quote.status)) {
      const reason =
        quote.status === "APPROVED" || quote.status === "CONVERTED"
          ? "Approved quotes are locked — the client signed off on this exact document."
          : "Archived quotes can't be edited.";
      return NextResponse.json({ error: reason }, { status: 400 });
    }
    if (body.lineItems.length === 0) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }

    const rawLineItems = body.lineItems as {
      name?: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number | null;
      isOptional?: boolean;
      requiresAgreement?: boolean;
      workItemId?: string | null;
      recurringInterval?: RecurringInterval | null;
      sortOrder?: number;
    }[];
    for (const li of rawLineItems) {
      li.quantity = intQuantity(li.quantity);
      li.unitPrice = unitPriceValue(li.unitPrice);
    }
    // Hand-typed items matching a price-book name inherit its cost (margins)
    const lineItems = await deriveLineItemAgreements(
      companyId,
      await backfillLineItemCosts(companyId, rawLineItems)
    );
    const subtotal = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unitPrice || 0), 0);
    const discountType =
      body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
    const discountValue = Number(body.discountValue) || 0;
    const taxRate = Number(body.taxRate) || null;
    const { discount, tax, total } = computeQuoteTotals({
      subtotal,
      discountType,
      discountValue,
      taxRate,
    });

    // Deposit settings clamp server-side (PERCENT 0–100, FIXED ≥ 0) — an
    // unclamped 150% deposit would mint a deposit invoice above the quote.
    const deposit = sanitizeDeposit(body);

    // Retried because re-pricing an outstanding deposit invoice can mint one
    // (see syncDepositInvoice); the whole edit is one transaction, so a
    // retry starts clean.
    const updated = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
      // Revision snapshot: a quote the client has SEEN is about to be
      // rewritten — keep the old version. Draft edits never snapshot.
      if (quote.sentAt) {
        const oldItems = await tx.quoteLineItem.findMany({
          where: { quoteId: quote.id },
          orderBy: { sortOrder: "asc" },
        });
        const revCount = await tx.quoteRevision.count({ where: { quoteId: quote.id } });
        await tx.quoteRevision.create({
          data: {
            quoteId: quote.id,
            revision: revCount + 1,
            total: quote.total,
            snapshot: JSON.parse(
              JSON.stringify({
                title: quote.title,
                status: quote.status,
                sentAt: quote.sentAt,
                subtotal: quote.subtotal,
                discountType: quote.discountType,
                discountValue: quote.discountValue,
                discount: quote.discount,
                taxRate: quote.taxRate,
                tax: quote.tax,
                total: quote.total,
                depositType: quote.depositType,
                depositValue: quote.depositValue,
                clientMessage: quote.clientMessage,
                disclaimer: quote.disclaimer,
                validUntil: quote.validUntil,
                lineItems: oldItems.map((li) => ({
                  name: li.name,
                  description: li.description,
                  quantity: li.quantity,
                  unitPrice: li.unitPrice,
                  total: li.total,
                  isOptional: li.isOptional,
                  optedOut: li.optedOut,
                })),
              })
            ),
          },
        });
      }
      await tx.quoteLineItem.deleteMany({ where: { quoteId: quote.id } });
      const saved = await tx.quote.update({
        where: { id: quote.id },
        data: {
          title: body.title || null,
          ...(body.propertyId !== undefined && { propertyId }),
          subtotal,
          discountType,
          discountValue: discount > 0 ? discountValue : null,
          discount: discount > 0 ? discount : null,
          taxRate,
          tax,
          total,
          depositType: deposit.depositType,
          depositValue: deposit.depositValue,
          clientMessage: body.clientMessage || null,
          disclaimer: body.disclaimer || null,
          notes: body.notes || null,
          validUntil: parseValidUntil(body.validUntil),
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
              workItemId: li.workItemId ?? null,
              recurringInterval: li.recurringInterval ?? null,
              sortOrder: li.sortOrder ?? i,
            })),
          },
        },
      });
      // An unpaid deposit invoice minted before this edit (Collect deposit on
      // a draft, or an earlier approval that was change-requested) follows
      // the new total, so approval doesn't reuse a stale amount.
      await syncDepositInvoice(tx, {
        id: saved.id,
        companyId: saved.companyId,
        contactId: saved.contactId,
        quoteNumber: saved.quoteNumber,
        total: Number(saved.total),
        depositType: saved.depositType,
        depositValue: saved.depositValue == null ? null : Number(saved.depositValue),
      });
      return saved;
    }));
    return NextResponse.json(updated);
  }

  const justSent = body.status === "AWAITING_RESPONSE" && !quote.sentAt;
  const approving = body.status === "APPROVED" && quote.status !== "APPROVED";

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(justSent && { sentAt: new Date() }),
      ...(approving && { approvedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.validUntil !== undefined && { validUntil: parseValidUntil(body.validUntil) }),
    },
  });

  // The same side effects the client's online sign-off runs: deposit
  // invoice, on-approval agreements, pipeline win, deposit pay-link email.
  const approval = approving
    ? await finishQuoteApproval(quote.id, { id: actor.id, name: actor.name })
    : null;

  // Sending the quote auto-issues any attached agreements set to "with quote"
  if (justSent) {
    await autoSendQuoteAgreements(quote.id, "WITH_QUOTE");
  }

  if (body.status && body.status !== quote.status) {
    logActivity({
      companyId,
      userId: actor.id,
      userName: actor.name,
      entityType: "quote",
      entityId: quote.id,
      action: "status_changed",
      detail: `${quote.status} → ${body.status}`,
    });
  }

  // Pipeline board: a sent quote advances the lead's card (approval's win is
  // recorded inside finishQuoteApproval)
  if (body.status === "AWAITING_RESPONSE") {
    await autoAdvance(prisma, companyId, quote.contactId, "QUOTE_SENT");
  }

  return NextResponse.json({
    ...updated,
    ...(approval
      ? {
          deposit: approval.deposit
            ? {
                invoiceId: approval.deposit.invoice.id,
                invoiceNumber: approval.deposit.invoice.invoiceNumber,
                amount: approval.deposit.amount,
                outstanding: approval.deposit.outstanding,
              }
            : null,
          emailed: approval.emailed,
        }
      : {}),
  });
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
  const quote = await prisma.quote.findFirst({
    where: { id, companyId },
    include: {
      _count: { select: { invoices: true, contracts: true } },
    },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  // A quote with invoices (a deposit — possibly PAID) or signed agreements
  // hanging off it is a paper trail, not a draft: deleting it orphans the
  // deposit invoice (Invoice.quote is SetNull), so the final invoice can no
  // longer find and credit the deposit and the client is billed for it twice.
  if (quote._count.invoices > 0 || quote._count.contracts > 0) {
    const what =
      quote._count.invoices > 0 && quote._count.contracts > 0
        ? "a deposit invoice and an agreement"
        : quote._count.invoices > 0
          ? "a deposit invoice"
          : "an agreement";
    return NextResponse.json(
      { error: `This quote has ${what} attached — archive it instead of deleting it.` },
      { status: 409 }
    );
  }

  // Converted quotes can go too — the job it became stays
  await prisma.quote.delete({ where: { id } });
  // Mirror the delete in QuickBooks (no-op unless the estimate synced)
  queueQuickBooksUnwind({ companyId, entityType: "ESTIMATE", localId: id });
  return NextResponse.json({ success: true });
}
