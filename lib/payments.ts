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
import { recomputeDepositApplied } from "@/lib/deposits";
import * as finix from "@/lib/finix";
import { estimateProcessingCostCents } from "@/lib/platform-costs";
import { notifyUsers } from "@/lib/push";
import { queueQuickBooksPaymentSync } from "@/lib/quickbooks";
import { sendEmail, reviewRequestEmail, paymentReceiptEmail } from "@/lib/email";
import { isPastDue } from "@/lib/due-dates";
import { paymentMethodLabel } from "@/lib/statuses";
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
      /** Card metadata from the payment instrument — feeds the interchange
       *  cost estimate on the Payment row (platform profitability). */
      cardBrand?: string | null;
      cardType?: string | null;
      /** The vaulted payment instrument (PIxxx) this charge ran against —
       *  persist on the contact when the client asked to save their card. */
      instrumentRef?: string;
      cardLast4?: string | null;
      cardExpMonth?: number | null;
      cardExpYear?: number | null;
    }
  | {
      success: false;
      error: string;
      /** Processor decline code (e.g. Finix failure_code) — drives the
       *  hard-vs-soft classification in lib/auto-charge.ts. */
      code?: string | null;
    };

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
        cardBrand: instrument.brand ?? null,
        cardType: instrument.card_type ?? null,
        instrumentRef: instrument.id,
        cardLast4: instrument.last_four ?? null,
        cardExpMonth: instrument.expiration_month ?? null,
        cardExpYear: instrument.expiration_year ?? null,
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
        // Minute-windowed like charge(): a double-fire never double-charges,
        // while a genuine retry (autopay retries run days apart) gets a fresh
        // id instead of replaying the original decline forever.
        idempotencyId: `${invoiceId}-stored-${finix.toCents(params.amount)}-${Math.floor(Date.now() / 60000)}`,
        tags: params.metadata ?? {},
      });

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        return {
          success: false,
          error: transfer.failure_message || "The stored payment method was declined.",
          code: transfer.failure_code,
        };
      }
      // Card metadata for the cost estimate — best-effort; the vaulted
      // instrument is fetched fresh since the exchange response is long gone.
      const instrument = await finix
        .getPaymentInstrument(params.customerRef)
        .catch(() => null);
      return {
        success: true,
        transactionId: transfer.id,
        amount: params.amount,
        pending: transfer.state === "PENDING",
        cardBrand: instrument?.brand ?? null,
        cardType: instrument?.card_type ?? null,
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
  /** Card metadata from the processor charge (ChargeResult) — only present
   *  on real processor payments; drives platform cost estimates. */
  cardBrand?: string | null;
  cardType?: string | null;
  /** Email the client a receipt. Defaults to true for processor payments
   *  (online, card-on-file, auto-charge) and false for manual records — a
   *  bookkeeping entry for last month's check shouldn't surprise-email the
   *  client. The manual Collect Payment form opts in explicitly. */
  emailReceipt?: boolean;
  /** ACH debits haven't settled yet — the receipt says "processing". */
  receiptPending?: boolean;
}

/**
 * Record a payment against an invoice and update the invoice status.
 * Marks the invoice PAID when total payments cover the total.
 */
export async function recordPayment(params: RecordPaymentParams) {
  // Platform-economics columns — only when money actually moved through the
  // processor (processorRef set). Manual cash/check/offline-card rows carry
  // no fee and cost us nothing.
  const isProcessorPayment =
    Boolean(params.processorRef) && (params.method === "CARD" || params.method === "ACH");
  const amountCents = Math.round(params.amount * 100);
  const feeCents = isProcessorPayment
    ? estimateFeeCents(amountCents, params.method as "CARD" | "ACH")
    : null;
  const estCostCents = isProcessorPayment
    ? estimateProcessingCostCents({
        amountCents,
        method: params.method as "CARD" | "ACH",
        cardBrand: params.cardBrand,
        cardType: params.cardType,
      })
    : null;

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
        feeCents,
        cardBrand: isProcessorPayment ? (params.cardBrand ?? null) : null,
        cardType: isProcessorPayment ? (params.cardType ?? null) : null,
        estCostCents,
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

    if (invoice.kind === "DEPOSIT" && invoice.quoteId && fullyPaid) {
      await recomputeDepositApplied(tx, invoice.quoteId);
    }

    return {
      payment,
      fullyPaid,
      invoiceNumber: invoice.invoiceNumber,
      subscriptionId: invoice.subscriptionId,
    };
  });

  // Stripe-style billing anchor: a plan's FIRST successful payment sets the
  // day-of-month all future cycles land on. Whoever pays — auto-charge, pay
  // link, or a manually recorded check — funnels through here, so the anchor
  // is set exactly once, from real money.
  if (result.fullyPaid && result.subscriptionId) {
    anchorPlanFromFirstPayment(result.subscriptionId, params.paidAt ?? new Date()).catch((e) =>
      console.error("[payments] plan anchor failed", e)
    );
  }

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

  // Receipt to the client — best-effort, never fails the recording.
  const wantReceipt = params.emailReceipt ?? isProcessorPayment;
  if (wantReceipt) {
    sendPaymentReceipt({
      invoiceId: params.invoiceId,
      amount: params.amount,
      method: params.method,
      pending: params.receiptPending ?? false,
    }).catch((e) => console.error("[payments] receipt email failed", e));
  }

  return { payment: result.payment, fullyPaid: result.fullyPaid };
}

/**
 * Anchor a scheduled plan to its first successful payment: stamp anchoredAt
 * and re-point nextRunDate one interval out from the payment day, so every
 * later cycle lands on that day-of-month. One-shot — an already-anchored (or
 * non-interval) subscription is left alone. Month math mirrors
 * lib/subscriptions.ts addInterval/addMonthsClamped; duplicated here because
 * importing lib/subscriptions from this file would create an import cycle
 * (subscriptions → auto-charge → payments).
 */
async function anchorPlanFromFirstPayment(subscriptionId: string, paidAt: Date): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { interval: true, anchoredAt: true },
  });
  if (!sub?.interval || sub.anchoredAt) return;

  const anchor = new Date(paidAt);
  anchor.setHours(12, 0, 0, 0); // noon-anchored like every engine date
  const months = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 }[sub.interval];
  const next = new Date(anchor);
  const targetDay = next.getDate();
  next.setDate(1); // avoid transient overflow while shifting the month
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, lastDay));

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { anchoredAt: anchor, nextRunDate: next },
  });
}

/** Email the client a receipt for a payment just recorded on their invoice. */
async function sendPaymentReceipt(params: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  pending: boolean;
}): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      invoiceNumber: true,
      publicToken: true,
      total: true,
      companyId: true,
      payments: { select: { amount: true } },
      contact: { select: { email: true } },
      company: {
        select: {
          name: true,
          email: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
  });
  if (!invoice?.contact?.email) return;

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Math.round((Number(invoice.total) - paid) * 100) / 100);
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const { subject, html } = paymentReceiptEmail({
    brand: invoice.company,
    companyName: invoice.company.name,
    invoiceNumber: invoice.invoiceNumber,
    amount: params.amount,
    methodLabel: paymentMethodLabel[params.method] ?? params.method,
    remainingBalance: remaining,
    payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
    pending: params.pending,
  });
  await sendEmail({
    companyId: invoice.companyId,
    to: invoice.contact.email,
    subject,
    html,
    replyTo: invoice.company.email || undefined,
    fromName: invoice.company.name,
  });
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
        status: isPastDue(invoice.dueDate) ? "PAST_DUE" : "AWAITING_PAYMENT",
        paidAt: null,
      },
    });
    // Reopening clears everyone's seen-it rows so a genuine re-payment
    // celebrates again for the whole team
    await tx.celebrationSeen.deleteMany({
      where: { kind: "INVOICE_PAID", entityId: invoiceId },
    });
  }

  if (invoice.kind === "DEPOSIT" && invoice.quoteId) {
    await recomputeDepositApplied(tx, invoice.quoteId);
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

/** Display label for a saved card — "Visa •••• 4242 · exp 12/27". */
export function savedCardLabel(card: {
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
}): string {
  const brand = card.cardBrand
    ? card.cardBrand.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "Card";
  const last4 = card.cardLast4 ? ` •••• ${card.cardLast4}` : "";
  const exp =
    card.cardExpMonth && card.cardExpYear
      ? ` · exp ${String(card.cardExpMonth).padStart(2, "0")}/${String(card.cardExpYear).slice(-2)}`
      : "";
  return `${brand}${last4}${exp}`;
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

/**
 * "How did we do?" email once an invoice is paid off, using the company's
 * configured review link.
 *
 * Deduped against the job-completion path (app/api/app/jobs/[id]/status),
 * which records a ReviewRequest row per job: a client who already got the ask
 * when the work was marked complete doesn't get a second one when they pay.
 * Invoices with no job behind them fall back to one ask per client per 60
 * days, so a repeat customer on a monthly plan isn't nagged every cycle.
 *
 * Silent no-op when the company hasn't set a review link, the client has no
 * email, or Resend isn't configured — this fires from the client's payment
 * request and must never fail it.
 */
export async function sendReviewRequest(params: {
  companyId: string;
  contactId?: string | null;
  jobId?: string | null;
  email: string;
  contactFirstName: string;
  jobTitle?: string | null;
}): Promise<void> {
  const { companyId, contactId, jobId, email, contactFirstName, jobTitle } = params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      reviewLink: true,
      brandColor: true,
      documentColor: true,
      brandColorSecondary: true,
      logoUrl: true,
    },
  });
  if (!company?.reviewLink) return;

  const alreadySent = jobId
    ? await prisma.reviewRequest.findFirst({ where: { companyId, jobId } })
    : contactId
      ? await prisma.reviewRequest.findFirst({
          where: {
            companyId,
            contactId,
            sentAt: { gte: new Date(Date.now() - 60 * 86400_000) },
          },
        })
      : null;
  if (alreadySent) return;

  // Name the work when we can — an invoice raised straight off a job knows it
  // even though the caller doesn't.
  const title =
    jobTitle ??
    (jobId
      ? (await prisma.job.findUnique({ where: { id: jobId }, select: { title: true } }))?.title
      : null);

  const { subject, html } = reviewRequestEmail({
    brand: company,
    companyName: company.name,
    contactFirstName,
    reviewLink: company.reviewLink,
    jobTitle: title,
  });
  const sent = await sendEmail({
    companyId,
    to: email,
    subject,
    html,
    fromName: company.name,
  });
  if (!sent) return;

  await prisma.reviewRequest.create({
    data: {
      companyId,
      contactId: contactId ?? null,
      jobId: jobId ?? null,
      email,
      sentAt: new Date(),
      method: "email",
    },
  });
}
