import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMerchant, getTransfer, finixConfigured } from "@/lib/finix";
import {
  recomputeInvoiceStatus,
  sendReviewRequest,
  estimateFeeCents,
} from "@/lib/payments";
import { estimateProcessingCostCents } from "@/lib/platform-costs";
import { queueQuickBooksUnwind, queueQuickBooksPaymentRefresh } from "@/lib/quickbooks";
import { notifyUsers } from "@/lib/push";
import type { Refund } from "@prisma/client";

/**
 * Finix webhook receiver. Register once per environment with
 * scripts/finix-register-webhook.mjs.
 *
 * SECURITY: the payload is treated as a HINT, never as truth — we extract the
 * resource id, re-fetch it from the Finix API with our credentials, and act on
 * that. A forged webhook can therefore only make us look at real data. Webhooks
 * are also a fast path, not a required one: merchant state is re-synced when
 * the Settings payments card loads, so missed events self-heal.
 *
 * Handled:
 *  - merchant created/updated  → sync Company.finixOnboardingState (+ owner push on approval)
 *  - transfer updated → FAILED → remove the recorded payment (late ACH returns)
 *  - reversal updated → FAILED → restore the refunded amount (the refund route
 *    already shrank the payment; the money never actually went back)
 */
export async function POST(req: NextRequest) {
  if (!finixConfigured()) return NextResponse.json({ received: true });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ received: true });

  // Payload shape: { entity, type, _embedded: { merchants: [...] } } (or
  // transfers/...). Pull ids defensively — versions vary.
  const embedded = body._embedded ?? {};
  const merchantHint = embedded.merchants?.[0]?.id;
  const transferHint = embedded.transfers?.[0]?.id;

  try {
    if (typeof merchantHint === "string" && merchantHint.startsWith("MU")) {
      await handleMerchant(merchantHint);
    }
    if (typeof transferHint === "string" && transferHint.startsWith("TR")) {
      await handleTransfer(transferHint);
    }
  } catch (err) {
    // Never bounce webhooks — Finix retries failures and the state re-syncs on
    // settings load anyway.
    console.error("[finix webhook] handler failed", err);
  }

  return NextResponse.json({ received: true });
}

async function handleMerchant(merchantId: string) {
  const merchant = await getMerchant(merchantId); // re-fetch = verification
  const company =
    (await prisma.company.findFirst({ where: { finixMerchantId: merchant.id } })) ??
    // First event for a new merchant: the company only knows its identity so far
    (await prisma.company.findFirst({ where: { finixIdentityId: merchant.identity } }));
  if (!company) return;

  const becameApproved =
    merchant.onboarding_state === "APPROVED" &&
    company.finixOnboardingState !== "APPROVED";

  await prisma.company.update({
    where: { id: company.id },
    data: {
      finixMerchantId: merchant.id,
      finixIdentityId: merchant.identity,
      finixOnboardingState: merchant.onboarding_state,
    },
  });

  if (becameApproved) {
    const owners = await prisma.user.findMany({
      where: { companyId: company.id, role: "OWNER", isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      owners.map((o) => o.id),
      {
        title: "Online payments approved!",
        body: "Your payment account is live — clients can now pay invoices by card or bank online.",
        url: "/app/settings",
        tag: "payments-approved",
      }
    );
  }
}

/**
 * An ACH debit we accepted optimistically has actually settled. The payment
 * row and the invoice's PAID status were written at accept time, so no money
 * moves here — this is just the first moment it's safe to ask the client for
 * a review, which the pay route deliberately skips while a debit is pending
 * (it can still bounce, and thanking someone whose money comes back is worse
 * than asking a few days late).
 */
async function handleTransferSettled(transferId: string) {
  const payment = await prisma.payment.findFirst({
    where: { processorRef: transferId },
    select: {
      companyId: true,
      invoice: {
        select: {
          status: true,
          jobId: true,
          contactId: true,
          contact: { select: { firstName: true, email: true } },
        },
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
  }).catch((e) => console.error("[finix webhook] review request failed", e));
}

async function handleTransfer(transferId: string) {
  const transfer = await getTransfer(transferId); // re-fetch = verification
  if (transfer.state === "SUCCEEDED") return handleTransferSettled(transfer.id);
  if (transfer.state !== "FAILED" && transfer.state !== "CANCELED") return;

  // A reversal we issued can die after the refund route already recorded it
  // (bank rejects the credit, processor cancels). The refund shrank the
  // payment but the money never went back — undo the bookkeeping.
  const refund = await prisma.refund.findFirst({
    where: { reversalRef: transfer.id },
  });
  if (refund) return handleReversalFailed(refund);

  // An accepted ACH debit we recorded can fail days later (insufficient funds,
  // closed account). Pull the payment record back out so the invoice reopens.
  const payment = await prisma.payment.findFirst({
    where: { processorRef: transfer.id },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (!payment) return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
  });

  // A bounced debit never really paid anything, so QuickBooks can't go on
  // showing it as received.
  queueQuickBooksUnwind({
    companyId: payment.companyId,
    entityType: "PAYMENT",
    localId: payment.id,
  });

  const owners = await prisma.user.findMany({
    where: { companyId: payment.companyId, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: `Payment failed — invoice #${payment.invoice?.invoiceNumber ?? ""}`,
      body: `A $${Number(payment.amount).toFixed(2)} online payment was returned by the bank. The invoice is open again.`,
      url: `/app/invoices/${payment.invoiceId}`,
      tag: `payment-failed-${payment.invoiceId}`,
    }
  );
}

/**
 * A refund's reversal FAILED/CANCELED at the processor. Restore the payment
 * amount, drop the Refund row (surviving rows = money that actually moved),
 * and put the invoice/QuickBooks/fee estimates back the way they were.
 * Idempotent under webhook retries: the row delete is inside the transaction,
 * so a concurrent duplicate rolls back on the missing row.
 */
async function handleReversalFailed(refund: Refund) {
  const payment = await prisma.payment.findUnique({
    where: { id: refund.paymentId },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (!payment) return; // payment gone (cascade already removed the refund)

  const refundAmount = Number(refund.amount);
  const restored = Math.round((Number(payment.amount) + refundAmount) * 100) / 100;
  const restoredCents = Math.round(restored * 100);
  const method = payment.method === "ACH" ? "ACH" : "CARD";
  const note = `Refund of $${refundAmount.toFixed(2)} failed — payment restored`;

  await prisma.$transaction(async (tx) => {
    await tx.refund.delete({ where: { id: refund.id } });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amount: restored,
        details: payment.details ? `${payment.details} · ${note}` : note,
        ...(payment.feeCents == null
          ? {}
          : { feeCents: estimateFeeCents(restoredCents, method) }),
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

  // QuickBooks got the reduced amount when the refund was recorded — push the
  // restored figure the same way.
  queueQuickBooksPaymentRefresh({
    companyId: payment.companyId,
    paymentId: payment.id,
  });

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
