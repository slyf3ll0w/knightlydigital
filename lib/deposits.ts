/**
 * Deposit invoicing.
 *
 * Deposits are configured on preset services (WorkItem) and a company-wide
 * default, summed onto a quote as a single FIXED deposit (see lib/statuses.ts
 * derivedQuoteDeposit). When a quote with a deposit is approved — or the business
 * clicks "Collect deposit" — `createDepositInvoice` mints a DEPOSIT invoice for
 * that amount, linked back to the quote. The quote's eventual final invoice nets
 * any PAID deposits (see app/api/app/invoices/route.ts).
 */

import type { DepositType, Prisma, PrismaClient } from "@prisma/client";
import { quoteDepositAmount } from "@/lib/statuses";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Normalize deposit settings from request input (used by the price-book item
 * routes and company settings). PERCENT clamps to 0-100, FIXED to >= 0; NONE
 * and FULL carry no value.
 */
export function sanitizeDeposit(body: {
  depositType?: unknown;
  depositValue?: unknown;
}): { depositType: DepositType; depositValue: number | null } {
  const t = body.depositType;
  const depositType: DepositType =
    t === "PERCENT" || t === "FIXED" || t === "FULL" ? t : "NONE";
  let depositValue: number | null = null;
  if (depositType === "PERCENT") {
    depositValue = Math.min(Math.max(Number(body.depositValue) || 0, 0), 100);
  } else if (depositType === "FIXED") {
    depositValue = Math.max(Number(body.depositValue) || 0, 0);
  }
  return { depositType, depositValue };
}

export type DepositQuote = {
  id: string;
  companyId: string;
  contactId: string;
  quoteNumber: number;
  total: number | { toString(): string };
  depositType: string;
  depositValue: number | { toString(): string } | null;
};

export type DepositInvoiceResult = {
  invoice: { id: string; invoiceNumber: number; publicToken: string; total: number };
  amount: number;
  created: boolean; // false when an existing deposit invoice was returned
};

/**
 * Create (or return the existing) deposit invoice for a quote. Idempotent: a
 * quote gets at most one deposit invoice. Returns null when the quote has no
 * deposit owed. Must run inside a transaction when sequencing matters.
 */
export async function createDepositInvoice(
  tx: Tx,
  quote: DepositQuote
): Promise<DepositInvoiceResult | null> {
  const amount = quoteDepositAmount(quote);
  if (amount <= 0) return null;

  // One deposit invoice per quote
  const existing = await tx.invoice.findFirst({
    where: { quoteId: quote.id, kind: "DEPOSIT" },
    select: { id: true, invoiceNumber: true, publicToken: true, total: true },
  });
  if (existing) {
    return {
      invoice: { ...existing, total: Number(existing.total) },
      amount: Number(existing.total),
      created: false,
    };
  }

  const last = await tx.invoice.findFirst({
    where: { companyId: quote.companyId },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const now = new Date();

  const created = await tx.invoice.create({
    data: {
      companyId: quote.companyId,
      contactId: quote.contactId,
      quoteId: quote.id,
      kind: "DEPOSIT",
      invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
      subject: `Deposit — Quote #${quote.quoteNumber}`,
      status: "AWAITING_PAYMENT",
      subtotal: amount,
      total: amount,
      issuedAt: now,
      dueDate: now,
      lineItems: {
        create: [
          {
            name: "Deposit",
            description: `Deposit for Quote #${quote.quoteNumber}`,
            quantity: 1,
            unitPrice: amount,
            total: amount,
            sortOrder: 0,
          },
        ],
      },
    },
    select: { id: true, invoiceNumber: true, publicToken: true, total: true },
  });

  return {
    invoice: { ...created, total: Number(created.total) },
    amount,
    created: true,
  };
}

/**
 * Total of PAID deposit invoices for a quote — the credit to net off the quote's
 * final invoice so the client isn't billed twice for the deposit.
 */
export async function paidDepositTotal(tx: Tx, quoteId: string): Promise<number> {
  const deposits = await tx.invoice.findMany({
    where: { quoteId, kind: "DEPOSIT", status: "PAID" },
    select: { total: true },
  });
  return Math.round(deposits.reduce((s, d) => s + Number(d.total), 0) * 100) / 100;
}
