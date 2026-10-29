import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { isPlatformMerchant, planBillingCredentials } from "@/lib/plan-billing-env";
import { recordInvoiceEvent, refreshSubscription } from "@/lib/plan-billing";
import { retrieveSquareInvoice } from "@/lib/square-billing-api";
import { prisma } from "@/lib/db";
import {
  getSquarePayment,
  getSquareRefund,
  squareConfigured,
  verifySquareWebhookSignature,
  type SquareWebhookEvent,
} from "@/lib/square";
import { markSquareRevoked, squareTokenForMerchant, SquareNotConnectedError } from "@/lib/square-connection";
import { recomputeInvoiceStatus, sendReviewRequest, estimateFeeCents } from "@/lib/payments";
import { estimateProcessingCostCents } from "@/lib/platform-costs";
import { queueQuickBooksUnwind, queueQuickBooksPaymentRefresh } from "@/lib/quickbooks";
import { notifyUsers } from "@/lib/push";
import type { Refund } from "@prisma/client";

/**
 * Square webhook receiver. One subscription per environment, made in the
 * Developer Console (Webhooks → Add subscription) with the developer token:
 *   URL     ${NEXTAUTH_URL}/api/public/webhooks/square
 *   events  oauth.authorization.revoked, payment.updated, refund.updated
 * and its signature key in SQUARE_WEBHOOK_SIGNATURE_KEY.
 *
 * SECURITY: the signature (HMAC over notification URL + body) is checked
 * first; a bad one is a 401 and nothing is read. Then, like the Finix
 * receiver, the payload is a HINT: the payment / refund is re-fetched from
 * Square with the seller's own token before anything changes. Webhooks are
 * a fast path, not a required one — the Settings "Check connection" and the
 * hourly token sweep catch a missed revocation.
 *
 * Handled:
 *  - oauth.authorization.revoked → connection torn down, owners pushed
 *  - payment.updated  COMPLETED → a pending ACH debit settled (review ask)
 *                     FAILED / CANCELED → recorded payment pulled back
 *  - refund.updated   REJECTED / FAILED → the refund's bookkeeping undone
 */
export async function POST(req: NextRequest) {
  if (!squareConfigured()) return NextResponse.json({ received: true });

  const rawBody = await req.text();
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_URL ??
    `${(process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")}/api/public/webhooks/square`;
  const ok = verifySquareWebhookSignature({
    rawBody,
    signatureHeader: req.headers.get("x-square-hmacsha256-signature"),
    notificationUrl,
  });
  if (!ok) {
    // No key configured = every event refused; set SQUARE_WEBHOOK_SIGNATURE_KEY
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let event: SquareWebhookEvent | null = null;
  try {
    event = JSON.parse(rawBody) as SquareWebhookEvent;
  } catch {
    return NextResponse.json({ received: true });
  }
  if (!event?.type) return NextResponse.json({ received: true });

  try {
    const merchantId = event.merchant_id;
    const objectId = event.data?.id;
    switch (event.type) {
      case "oauth.authorization.revoked":
        if (merchantId) await markSquareRevoked(merchantId, "webhook");
        break;
      case "payment.updated":
      case "payment.created":
        if (merchantId && objectId) await handlePayment(merchantId, objectId);
        break;
      case "refund.updated":
      case "refund.created":
        if (merchantId && objectId) await handleRefund(merchantId, objectId);
        break;
      // Plan billing on WorkBench's own connected account (lib/plan-billing.ts):
      // subscription / invoice events are only ever ours — any other merchant's
      // are ignored. Add the event types to this webhook subscription in the
      // Developer Console; the hourly sweep covers anything missed.
      case "subscription.created":
      case "subscription.updated":
        if (merchantId && objectId && (await isPlatformMerchant(merchantId))) await refreshSubscription(objectId);
        break;
      case "invoice.payment_made":
      case "invoice.scheduled_charge_failed":
      case "invoice.updated":
      case "invoice.published":
      case "invoice.canceled":
        if (merchantId && objectId && (await isPlatformMerchant(merchantId))) await handlePlatformInvoice(objectId, event.type);
        break;
      default:
        break;
    }
  } catch (err) {
    // Never bounce webhooks — Square retries failures for a day and the
    // state self-heals from the other paths anyway.
    if (!(err instanceof SquareNotConnectedError)) reportError("[square webhook] handler failed", err);
  }

  return NextResponse.json({ received: true });
}

async function handlePlatformInvoice(invoiceId: string, eventType: string) {
  const creds = await planBillingCredentials();
  if (!creds) return;
  const invoice = await retrieveSquareInvoice(creds.token, invoiceId); // re-fetch = verification
  await recordInvoiceEvent(invoice, eventType);
}

async function handlePayment(merchantId: string, paymentId: string) {
  const { token } = await squareTokenForMerchant(merchantId);
  const payment = await getSquarePayment(token, paymentId); // re-fetch = verification
  if (payment.status === "COMPLETED") return handlePaymentSettled(payment.id);
  if (payment.status !== "FAILED" && payment.status !== "CANCELED") return;

  // An accepted ACH debit we recorded can fail days later (insufficient
  // funds, closed account). Pull the payment record back out so the invoice
  // reopens — same unwind as the Finix receiver.
  const row = await prisma.payment.findFirst({
    where: { processorRef: payment.id },
    include: { invoice: { select: { invoiceNumber: true, subscriptionId: true } } },
  });
  if (!row) return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: row.id } });
    await recomputeInvoiceStatus(tx, row.invoiceId);
    if (row.invoice?.subscriptionId && row.details?.startsWith("Auto-charged")) {
      await tx.invoice.update({
        where: { id: row.invoiceId },
        data: {
          autoChargeNextAt: new Date(Date.now() + 24 * 3600_000),
          autoChargeGaveUpAt: null,
          autoChargeAttempts: { increment: 1 },
          autoChargeLastError: "Bank returned the payment",
        },
      });
    }
  });

  queueQuickBooksUnwind({ companyId: row.companyId, entityType: "PAYMENT", localId: row.id });

  const owners = await prisma.user.findMany({
    where: { companyId: row.companyId, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: `Payment failed — invoice #${row.invoice?.invoiceNumber ?? ""}`,
      body: `A $${Number(row.amount).toFixed(2)} online payment was returned by the bank. The invoice is open again.`,
      url: `/app/invoices/${row.invoiceId}`,
      tag: `payment-failed-${row.invoiceId}`,
    }
  );
}

/** A pending ACH debit has settled: the first safe moment to ask for a
 *  review (the pay route skips it while the debit could still bounce).
 *  Card payments complete at once and fire this too — sendReviewRequest
 *  dedupes per job / contact, so the ask the pay route already sent wins. */
async function handlePaymentSettled(paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { processorRef: paymentId },
    select: {
      companyId: true,
      invoice: {
        select: { status: true, jobId: true, contactId: true, contact: { select: { firstName: true, email: true } } },
      },
    },
  });
  const contact = payment?.invoice?.contact;
  if (!payment || payment.invoice?.status !== "PAID" || !contact?.email) return;
  await sendReviewRequest({
    companyId: payment.companyId,
    contactId: payment.invoice.contactId,
    jobId: payment.invoice.jobId,
    email: contact.email,
    contactFirstName: contact.firstName,
  }).catch((e) => reportError("[square webhook] review request failed", e));
}

async function handleRefund(merchantId: string, refundId: string) {
  const { token } = await squareTokenForMerchant(merchantId);
  const refund = await getSquareRefund(token, refundId); // re-fetch = verification
  if (refund.status !== "REJECTED" && refund.status !== "FAILED") return;
  const row = await prisma.refund.findFirst({ where: { reversalRef: refund.id } });
  if (row) await handleRefundFailed(row);
}

/**
 * A refund died at Square after the refund route recorded it. Restore the
 * payment amount, drop the Refund row (surviving rows = money that moved),
 * and put the invoice / QuickBooks / fee estimates back. Idempotent under
 * retries: the row delete is inside the transaction.
 */
async function handleRefundFailed(refund: Refund) {
  const payment = await prisma.payment.findUnique({
    where: { id: refund.paymentId },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (!payment) return;

  const refundAmount = Number(refund.amount);
  const restored = Math.round((Number(payment.amount) + refundAmount) * 100) / 100;
  const refundedSurcharge = Number(refund.surchargeAmount ?? 0);
  const restoredSurcharge =
    refundedSurcharge > 0
      ? Math.round((Number(payment.surchargeAmount ?? 0) + refundedSurcharge) * 100) / 100
      : undefined;
  const restoredCents = Math.round(restored * 100);
  const method = payment.method === "ACH" ? "ACH" : "CARD";
  const note = `Refund of $${refundAmount.toFixed(2)} failed — payment restored`;

  await prisma.$transaction(async (tx) => {
    await tx.refund.delete({ where: { id: refund.id } });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amount: restored,
        ...(restoredSurcharge !== undefined ? { surchargeAmount: restoredSurcharge } : {}),
        details: payment.details ? `${payment.details} · ${note}` : note,
        ...(payment.feeCents == null ? {} : { feeCents: estimateFeeCents(restoredCents, method) }),
        ...(payment.estCostCents == null
          ? {}
          : {
              estCostCents: estimateProcessingCostCents({
                amountCents: restoredCents,
                method,
                cardBrand: payment.cardBrand,
                cardType: payment.cardType,
              }),
            }),
      },
    });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
  });

  queueQuickBooksPaymentRefresh({ companyId: payment.companyId, paymentId: payment.id });

  const owners = await prisma.user.findMany({
    where: { companyId: payment.companyId, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: `Refund failed — invoice #${payment.invoice?.invoiceNumber ?? ""}`,
      body: `A $${refundAmount.toFixed(2)} refund couldn't be completed, so the payment was restored. Try the refund again.`,
      url: `/app/invoices/${payment.invoiceId}`,
      tag: `refund-failed-${payment.id}`,
    }
  );
}
