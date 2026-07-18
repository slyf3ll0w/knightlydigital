/**
 * Payment processing layer.
 *
 * WorkBench is free software — payment processing is the business model, so this
 * layer is built to make taking payments as easy as possible:
 *
 *  - `getProcessor()` returns the active PaymentProcessor implementation,
 *    selected by the PAYMENT_PROCESSOR env var: "manual" (records payments
 *    without moving money) or "finix" (real card/ACH charges through the
 *    company's Finix merchant account — see lib/finix.ts). Flipping the env
 *    var changes no call sites.
 *  - `recordPayment()` is the single write path for payments: it creates the
 *    Payment row, recalculates the invoice balance, and flips invoice status.
 */

import { prisma } from "@/lib/db";
import * as finix from "@/lib/finix";
import { notifyUsers } from "@/lib/push";
import { queueQuickBooksPaymentSync } from "@/lib/quickbooks";
import type { PaymentMethod, Prisma } from "@prisma/client";

// ─── Processor interface ─────────────────────────────────────────────────────

export type ChargeResult =
  | {
      success: true;
      transactionId: string;
      amount: number;
      /** ACH debits stay pending for days after acceptance; card charges settle instantly. */
      pending?: boolean;
      /** Buyer identity the processor created/used — persist on the contact for reuse. */
      buyerIdentityRef?: string;
    }
  | { success: false; error: string };

export type CheckoutSession =
  | { success: true; url: string; expiresAt: Date }
  | { success: false; error: string };

export interface ChargeParams {
  amount: number; // dollars
  currency?: string;
  method: "card" | "ach";
  surcharge?: number;
  description?: string;
  metadata?: Record<string, string>;
  /** One-time tokenized payment details from the processor's client-side form (finix.js TKxxx). */
  token?: string;
  /** The company's processor merchant account (Company.finixMerchantId). */
  merchantRef?: string;
  /** Buyer identity to charge under — existing ref reused, otherwise created from the details. */
  buyer?: {
    identityRef?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

export interface CheckoutParams {
  invoiceId: string;
  publicToken: string;
  amount: number;
  customerEmail?: string;
  description?: string;
}

export interface ChargeStoredParams {
  /** The processor's stored customer/vault token (Contact.processorCustomerRef). */
  customerRef: string;
  amount: number; // dollars
  currency?: string;
  surcharge?: number;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentProcessor {
  readonly name: string;
  /** True once this processor can actually move money. */
  readonly live: boolean;
  /** Charge a card / bank account directly (card-on-file, admin-initiated). */
  charge(params: ChargeParams): Promise<ChargeResult>;
  /**
   * Charge a previously-vaulted payment method by its stored token. This is
   * the seam recurring billing uses for true auto-charge — the engine only
   * calls it when `live` is true and the contact has a processorCustomerRef,
   * so nothing fires until a real processor is registered and a card is saved.
   */
  chargeStored(params: ChargeStoredParams): Promise<ChargeResult>;
  /** Create a hosted checkout the client can open from an invoice or quote deposit. */
  createCheckout(params: CheckoutParams): Promise<CheckoutSession>;
}

/**
 * Manual processor — the pre-launch default. It cannot move money; online
 * checkout falls back to the hosted /pay page where the client sees payment
 * instructions and the admin records the payment manually.
 */
class ManualProcessor implements PaymentProcessor {
  readonly name = "manual";
  readonly live = false;

  async charge(_params: ChargeParams): Promise<ChargeResult> {
    return {
      success: false,
      error: "Online payments are not enabled yet. Record this payment manually.",
    };
  }

  async chargeStored(_params: ChargeStoredParams): Promise<ChargeResult> {
    return {
      success: false,
      error: "Online payments are not enabled yet. Record this payment manually.",
    };
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return {
      success: true,
      url: `${baseUrl}/pay/${params.publicToken}`,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
    };
  }
}

/**
 * Finix processor (Streamflaire Payments). Charges run per-company: the caller
 * passes the company's finixMerchantId as merchantRef plus a one-time finix.js
 * token; the buyer's Finix identity is created on first use and returned so the
 * route can persist it on the contact. Companies without an APPROVED merchant
 * fall back to the same "record manually" decline as the manual processor.
 */
class FinixProcessor implements PaymentProcessor {
  readonly name = "finix";
  get live(): boolean {
    return finix.finixConfigured();
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.live) {
      return { success: false, error: "Online payments are not enabled yet. Record this payment manually." };
    }
    if (!params.merchantRef) {
      return { success: false, error: "This business hasn't finished payment setup yet. Please contact them to arrange payment." };
    }
    if (!params.token) {
      return { success: false, error: "Missing payment details. Please re-enter your card or bank information." };
    }

    try {
      const identityId =
        params.buyer?.identityRef ??
        (await finix.createBuyerIdentity({
          firstName: params.buyer?.firstName,
          lastName: params.buyer?.lastName,
          email: params.buyer?.email,
          phone: params.buyer?.phone,
        })).id;

      const instrument = await finix.exchangeToken({
        token: params.token,
        identityId,
      });

      const transfer = await finix.createTransfer({
        amountCents: finix.toCents(params.amount),
        merchantId: params.merchantRef,
        sourceInstrumentId: instrument.id,
        // One attempt per invoice+amount+minute: a double-click never double
        // charges, while a genuine retry after a decline gets a fresh id.
        idempotencyId: `${params.metadata?.invoiceId ?? "inv"}-${finix.toCents(params.amount)}-${Math.floor(Date.now() / 60000)}`,
        tags: params.metadata ?? {},
      });

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        return {
          success: false,
          error: transfer.failure_message || "The payment was declined. Please try another payment method.",
        };
      }

      return {
        success: true,
        transactionId: transfer.id,
        amount: params.amount,
        pending: transfer.state === "PENDING",
        buyerIdentityRef: identityId,
      };
    } catch (err) {
      if (err instanceof finix.FinixError) {
        // Card declines etc. surface as API errors too — show Finix's message.
        return { success: false, error: err.message };
      }
      console.error("[payments] finix charge failed", err);
      return { success: false, error: "Payment failed. Please try again." };
    }
  }

  async chargeStored(params: ChargeStoredParams): Promise<ChargeResult> {
    // customerRef is a vaulted Finix payment instrument (PIxxx). The merchant
    // comes from the invoice's company, resolved via metadata.
    const invoiceId = params.metadata?.invoiceId;
    if (!invoiceId) return { success: false, error: "Missing invoice reference for stored charge." };

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { company: { select: { finixMerchantId: true, finixOnboardingState: true } } },
      });
      const merchantId = invoice?.company.finixMerchantId;
      if (!this.live || !merchantId || invoice?.company.finixOnboardingState !== "APPROVED") {
        return { success: false, error: "Online payments are not enabled for this business." };
      }

      const transfer = await finix.createTransfer({
        amountCents: finix.toCents(params.amount),
        merchantId,
        sourceInstrumentId: params.customerRef,
        idempotencyId: `${invoiceId}-stored-${finix.toCents(params.amount)}`,
        tags: params.metadata ?? {},
      });

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        return { success: false, error: transfer.failure_message || "The stored payment method was declined." };
      }
      return {
        success: true,
        transactionId: transfer.id,
        amount: params.amount,
        pending: transfer.state === "PENDING",
      };
    } catch (err) {
      if (err instanceof finix.FinixError) return { success: false, error: err.message };
      console.error("[payments] finix stored charge failed", err);
      return { success: false, error: "Auto-charge failed." };
    }
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    // The hosted /pay page IS the checkout — it mounts the finix.js form when
    // the company's merchant is approved.
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return {
      success: true,
      url: `${baseUrl}/pay/${params.publicToken}`,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
    };
  }
}

const processors: Record<string, PaymentProcessor> = {
  manual: new ManualProcessor(),
  finix: new FinixProcessor(),
};

export function getProcessor(): PaymentProcessor {
  const key = process.env.PAYMENT_PROCESSOR ?? "manual";
  return processors[key] ?? processors.manual;
}

// ─── Payment recording (single write path) ───────────────────────────────────

export interface RecordPaymentParams {
  companyId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string | null;
  details?: string | null;
  processorRef?: string | null;
  surchargeAmount?: number | null;
  paidAt?: Date;
  /** Team member who recorded it — skipped in the owner push so people
   *  don't get notified about their own keystrokes. */
  recordedById?: string | null;
}

/**
 * Record a payment against an invoice and update the invoice status.
 * Marks the invoice PAID when total payments cover the total.
 */
export async function recordPayment(params: RecordPaymentParams) {
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: params.invoiceId, companyId: params.companyId },
      include: { payments: true },
    });
    if (!invoice) throw new Error("Invoice not found");

    const payment = await tx.payment.create({
      data: {
        companyId: params.companyId,
        invoiceId: invoice.id,
        contactId: invoice.contactId,
        amount: params.amount,
        method: params.method,
        referenceNumber: params.referenceNumber ?? null,
        details: params.details ?? null,
        processorRef: params.processorRef ?? null,
        surchargeAmount: params.surchargeAmount ?? null,
        paidAt: params.paidAt ?? new Date(),
      },
    });

    const paidSoFar =
      invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + params.amount;
    const fullyPaid = paidSoFar >= Number(invoice.total) - 0.005;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: fullyPaid
        ? { status: "PAID", paidAt: params.paidAt ?? new Date() }
        : invoice.status === "DRAFT"
          ? { status: "AWAITING_PAYMENT" }
          : {},
    });

    return { payment, fullyPaid, invoiceNumber: invoice.invoiceNumber };
  });

  // Push the good news to the owner(s) — covers online /pay payments,
  // subscription auto-charges, and payments a teammate recorded.
  const owners = await prisma.user.findMany({
    where: { companyId: params.companyId, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id).filter((id) => id !== params.recordedById),
    {
      title: result.fullyPaid
        ? `Invoice #${result.invoiceNumber} paid`
        : `Payment received — invoice #${result.invoiceNumber}`,
      body: `$${params.amount.toFixed(2)} · ${params.method.toLowerCase().replace(/_/g, " ")}`,
      url: `/app/invoices/${params.invoiceId}`,
      tag: `payment-${params.invoiceId}`,
    }
  );

  // Push the invoice + payment to QuickBooks when the company has a
  // connection (instant no-op otherwise; never blocks or fails recording).
  queueQuickBooksPaymentSync({
    companyId: params.companyId,
    invoiceId: params.invoiceId,
    paymentId: result.payment.id,
  });

  return { payment: result.payment, fullyPaid: result.fullyPaid };
}

/**
 * Re-derive an invoice's status from its remaining payments — shared by the
 * routes that shrink or remove a payment (corrections, refunds).
 */
export async function recomputeInvoiceStatus(
  tx: Prisma.TransactionClient,
  invoiceId: string
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const fullyPaid = paid > 0 && paid >= Number(invoice.total) - 0.005;

  if (fullyPaid) {
    const lastPaidAt = invoice.payments.reduce<Date | null>(
      (latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest),
      null
    );
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID", paidAt: lastPaidAt ?? new Date() },
    });
  } else if (invoice.status === "PAID") {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status:
          invoice.dueDate && invoice.dueDate < new Date() ? "PAST_DUE" : "AWAITING_PAYMENT",
        paidAt: null,
      },
    });
  }
}

/** Outstanding balance on an invoice (total minus recorded payments). */
export function invoiceBalance(invoice: {
  total: number | { toString(): string };
  payments: { amount: number | { toString(): string } }[];
}): number {
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  return Math.round((Number(invoice.total) - paid) * 100) / 100;
}

/** Calculate the surcharge amount for a given payment total and rate. */
export function calculateSurcharge(amount: number, rateDecimal: number): number {
  return Math.round(amount * rateDecimal * 100) / 100;
}

/**
 * Workbench's processing rates — what the fee profile deducts from payouts.
 * Env-tunable so live-rate changes don't need a deploy; keep these matching
 * the fee profile configured in the Finix dashboard.
 */
export function processingFees() {
  return {
    cardBps: Number(process.env.WORKBENCH_CARD_FEE_BPS ?? 290),
    cardFixedCents: Number(process.env.WORKBENCH_CARD_FEE_FIXED_CENTS ?? 30),
    achBps: Number(process.env.WORKBENCH_ACH_FEE_BPS ?? 75),
    achFixedCents: Number(process.env.WORKBENCH_ACH_FEE_FIXED_CENTS ?? 0),
  };
}

/** Estimated processing fee in cents for one payment (settlements hold the real number). */
export function estimateFeeCents(amountCents: number, method: "CARD" | "ACH"): number {
  const f = processingFees();
  return method === "ACH"
    ? Math.round((amountCents * f.achBps) / 10000) + f.achFixedCents
    : Math.round((amountCents * f.cardBps) / 10000) + f.cardFixedCents;
}

/** Human label like "2.9% + 30¢" / "0.75%" for a bps + fixed-cents pair. */
export function feeRateLabel(bps: number, fixedCents: number): string {
  const pct = `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  return fixedCents > 0 ? `${pct} + ${fixedCents}¢` : pct;
}

/** Send a payment reminder via email/SMS (stub — wire to Resend/Twilio). */
export async function sendPaymentReminder(_params: {
  invoiceId: string;
  email?: string;
  phone?: string;
  amount: number;
  dueDate?: Date;
}): Promise<void> {
  // TODO: integrate email (Resend) and SMS (Twilio)
  console.log("[payments] reminder sent for invoice", _params.invoiceId);
}

/** Fire a review request after payment (stub — wire to email/SMS). */
export async function sendReviewRequest(_params: {
  companyName: string;
  reviewLink: string;
  email?: string;
  phone?: string;
}): Promise<void> {
  // TODO: integrate email (Resend) and SMS (Twilio)
  console.log("[payments] review request sent");
}
