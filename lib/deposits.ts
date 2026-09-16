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

import { randomBytes } from "crypto";
import type { DepositType, Prisma, PrismaClient } from "@prisma/client";
import { quoteDepositAmount } from "@/lib/statuses";
import { dueDateFromTerms, isPastDue } from "@/lib/due-dates";

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
  /** Still owed on the deposit invoice (0 once paid) — approval re-sends the
   *  pay link while this is > 0, whether or not the invoice was just minted. */
  outstanding: number;
};

type ExistingDeposit = {
  id: string;
  invoiceNumber: number;
  publicToken: string;
  total: { toString(): string } | number;
  status: string;
  payments: {
    amount: { toString(): string } | number;
    surchargeAmount: { toString(): string } | number | null;
  }[];
};

const existingDepositSelect = {
  id: true,
  invoiceNumber: true,
  publicToken: true,
  total: true,
  status: true,
  payments: { select: { amount: true, surchargeAmount: true } },
} as const;

function depositOutstanding(inv: ExistingDeposit): number {
  // Shelved by the business (collecting on site, say): nothing to ask for
  // online — /pay refuses archived invoices, so a re-sent link would error.
  if (inv.status === "ARCHIVED") return 0;
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  const surcharges = inv.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  return Math.max(0, Math.round((Number(inv.total) + surcharges - paid) * 100) / 100);
}

/**
 * Bring an already-minted, never-paid deposit invoice in line with what the
 * quote says the deposit is now. "Collect deposit" can run before approval,
 * and the quote can be revised after that (a change request is the normal
 * path) — without this the client approves a $3,000 quote and is asked for
 * the $500 deposit computed on the $1,000 draft. Updated in place so the pay
 * link already in the inbox keeps working and simply shows the new amount.
 * Anything with payment history, or that the business archived, is left
 * alone. Returns null when the deposit was removed (amount now 0).
 */
async function syncExistingDeposit(
  tx: Tx,
  existing: ExistingDeposit,
  amount: number,
  quoteNumber: number
): Promise<ExistingDeposit | null> {
  if (existing.payments.length > 0 || existing.status === "ARCHIVED" || existing.status === "PAID") {
    return existing;
  }
  if (amount <= 0) {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.delete({ where: { id: existing.id } });
    return null;
  }
  if (Math.abs(Number(existing.total) - amount) < 0.005) return existing;
  await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
  return tx.invoice.update({
    where: { id: existing.id },
    data: {
      subtotal: amount,
      total: amount,
      lineItems: {
        create: [
          {
            name: "Deposit",
            description: `Deposit for Quote #${quoteNumber}`,
            quantity: 1,
            unitPrice: amount,
            total: amount,
            sortOrder: 0,
          },
        ],
      },
    },
    select: existingDepositSelect,
  });
}

/**
 * After a quote edit: re-price (or drop) its unpaid deposit invoice. Never
 * creates one — that is approval's / "Collect deposit"'s job.
 */
export async function syncDepositInvoice(tx: Tx, quote: DepositQuote): Promise<void> {
  const existing = await tx.invoice.findFirst({
    where: { quoteId: quote.id, kind: "DEPOSIT" },
    select: existingDepositSelect,
  });
  if (!existing) return;
  await syncExistingDeposit(tx, existing, quoteDepositAmount(quote), quote.quoteNumber);
}

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

  // One deposit invoice per quote — re-priced if the quote changed under it
  const found = await tx.invoice.findFirst({
    where: { quoteId: quote.id, kind: "DEPOSIT" },
    select: existingDepositSelect,
  });
  if (found) {
    const existing = await syncExistingDeposit(tx, found, amount, quote.quoteNumber);
    if (!existing) return null;
    return {
      invoice: {
        id: existing.id,
        invoiceNumber: existing.invoiceNumber,
        publicToken: existing.publicToken,
        total: Number(existing.total),
      },
      amount: Number(existing.total),
      created: false,
      outstanding: depositOutstanding(existing),
    };
  }
  if (amount <= 0) return null;

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
      publicToken: randomBytes(24).toString("hex"),
      kind: "DEPOSIT",
      invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
      subject: `Deposit — Quote #${quote.quoteNumber}`,
      status: "AWAITING_PAYMENT",
      subtotal: amount,
      total: amount,
      issuedAt: now,
      dueDate: dueDateFromTerms(now, 0),
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
    outstanding: amount,
  };
}

/**
 * Money actually received against a quote's deposit invoices — the credit to
 * net off the final invoice so the client isn't billed twice. Counts every
 * payment on every DEPOSIT invoice (paid, partially paid, or archived after a
 * partial payment), principal only: Payment.amount includes the card
 * surcharge, which isn't money toward the job. Capped at each invoice's total.
 */
export function depositCredit(
  deposits: {
    total: number | { toString(): string };
    payments: {
      amount: number | { toString(): string };
      surchargeAmount?: number | { toString(): string } | null;
    }[];
  }[]
): number {
  const sum = deposits.reduce((s, d) => {
    const principal = d.payments.reduce(
      (p, x) => p + Number(x.amount) - Number(x.surchargeAmount ?? 0),
      0
    );
    return s + Math.min(Math.max(0, principal), Number(d.total));
  }, 0);
  return Math.round(sum * 100) / 100;
}

export async function paidDepositTotal(tx: Tx, quoteId: string): Promise<number> {
  const deposits = await tx.invoice.findMany({
    where: { quoteId, kind: "DEPOSIT" },
    select: { total: true, payments: { select: { amount: true, surchargeAmount: true } } },
  });
  return depositCredit(deposits);
}

/**
 * Re-derive the deposit credit on a quote's final invoice from the payments
 * received on its deposit invoices. The final invoice stores `total` net of
 * `depositApplied`, so both move together when a deposit pays after the final
 * invoice was created, or when a pending ACH deposit payment later bounces.
 */
export async function recomputeDepositApplied(tx: Tx, quoteId: string): Promise<void> {
  const quote = await tx.quote.findFirst({
    where: { id: quoteId },
    select: { jobId: true, companyId: true },
  });
  if (!quote) return;

  // The final invoice is usually found through the converted job, but a quote
  // that never converted (work invoiced directly, or abandoned) can still have
  // a non-deposit invoice linked by quoteId — without this, a paid deposit on
  // an unconverted quote has no path to ever being credited.
  const final = await tx.invoice.findFirst({
    where: {
      kind: { not: "DEPOSIT" },
      companyId: quote.companyId,
      OR: [
        ...(quote.jobId ? [{ jobId: quote.jobId }] : []),
        { quoteId },
      ],
    },
    include: { payments: true },
  });
  if (!final) return;

  const gross =
    Math.round((Number(final.total) + Number(final.depositApplied ?? 0)) * 100) / 100;
  const applied = Math.min(await paidDepositTotal(tx, quoteId), gross);
  if (applied === Number(final.depositApplied ?? 0)) return;

  const netTotal = Math.round((gross - applied) * 100) / 100;
  // Payment amounts include their card surcharges, so coverage is against
  // netTotal + surcharges (inlined — importing lib/payments here would cycle).
  const paid = final.payments.reduce((s, p) => s + Number(p.amount), 0);
  const surcharges = final.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  const fullyPaid = paid > 0 && paid >= netTotal + surcharges - 0.005;

  await tx.invoice.update({
    where: { id: final.id },
    data: {
      depositApplied: applied > 0 ? applied : null,
      total: netTotal,
      ...(fullyPaid && final.status !== "PAID"
        ? { status: "PAID", paidAt: new Date() }
        : {}),
      ...(!fullyPaid && final.status === "PAID"
        ? {
            status: isPastDue(final.dueDate) ? "PAST_DUE" : "AWAITING_PAYMENT",
            paidAt: null,
          }
        : {}),
    },
  });
}
