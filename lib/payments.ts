/**
 * Payment processing layer.
 *
 * WorkBench is free software — payment processing is the business model, so this
 * layer is built to make taking payments as easy as possible:
 *
 *  - `getProcessor()` returns the active PaymentProcessor implementation,
 *    selected by the PAYMENT_PROCESSOR env var. Today only "manual" exists
 *    (records payments without moving money). When David's processor is live,
 *    add a `FinixProcessor` (or Stripe/Square) implementing the same interface
 *    and flip the env var — no call sites change.
 *  - `recordPayment()` is the single write path for payments: it creates the
 *    Payment row, recalculates the invoice balance, and flips invoice status.
 */

import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/push";
import { queueQuickBooksPaymentSync } from "@/lib/quickbooks";
import type { PaymentMethod } from "@prisma/client";

// ─── Processor interface ─────────────────────────────────────────────────────

export type ChargeResult =
  | { success: true; transactionId: string; amount: number }
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

// When the processor account exists, implement it here and register it below.
// class FinixProcessor implements PaymentProcessor { ... }

const processors: Record<string, PaymentProcessor> = {
  manual: new ManualProcessor(),
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
