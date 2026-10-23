import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import {
  recordPayment,
  invoiceBalance,
  acquireChargeLock,
  releaseChargeLock,
  calculateSurcharge,
  sendReviewRequest,
} from "@/lib/payments";
import { recomputeDepositApplied } from "@/lib/deposits";
import { logActivity } from "@/lib/activity";
import { getSquarePayment, SquareError } from "@/lib/square";
import { squareTokenForCompany } from "@/lib/square-connection";
import { tapToPayEnabled } from "@/lib/tap-to-pay";

/**
 * POST { paymentId } — the phone app took a Tap to Pay payment through the
 * Square Mobile Payments SDK; record it against this invoice. The body is a
 * HINT only: the payment is re-read from Square with the seller's token and
 * must be COMPLETED, for this seller, and tagged with this invoice
 * (reference_id). Idempotent on the Square payment id (processorRef) — the
 * webhook may land first, or the page may retry after a dropped response.
 * Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 2.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!tapToPayEnabled()) return NextResponse.json({ error: "Tap to Pay isn't available yet." }, { status: 404 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { paymentId?: unknown } | null;
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId || paymentId.length > 192) return NextResponse.json({ error: "paymentId required." }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      quoteId: true,
      jobId: true,
      contact: { select: { id: true, email: true, firstName: true } },
      company: { select: { surchargeEnabled: true, surchargeRate: true, squareLocationId: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  // Already on the books (webhook or a retry): answer as if we just did it.
  const existing = await prisma.payment.findFirst({
    where: { companyId: actor.companyId, processorRef: paymentId },
    select: { id: true, invoiceId: true, amount: true },
  });
  if (existing) {
    const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: existing.invoiceId }, select: { status: true } });
    return NextResponse.json({ success: true, amount: Number(existing.amount), fullyPaid: fresh.status === "PAID", duplicate: true });
  }

  let payment;
  try {
    const { token } = await squareTokenForCompany(actor.companyId);
    payment = await getSquarePayment(token, paymentId);
  } catch (err) {
    reportError("[tap-to-pay] payment lookup failed", err);
    const msg = err instanceof SquareError ? err.message : "Square didn't answer. The payment may still be recorded by the webhook.";
    return NextResponse.json({ error: msg }, { status: 424 });
  }

  if (payment.reference_id && payment.reference_id !== invoice.id) {
    return NextResponse.json({ error: "That payment belongs to a different invoice." }, { status: 409 });
  }
  if (invoice.company.squareLocationId && payment.location_id && payment.location_id !== invoice.company.squareLocationId) {
    return NextResponse.json({ error: "That payment is at a different Square location." }, { status: 409 });
  }
  if (payment.status !== "COMPLETED" && payment.status !== "APPROVED") {
    return NextResponse.json({ error: `Square reports the payment as ${payment.status.toLowerCase()}.` }, { status: 409 });
  }
  if (payment.amount_money.currency && payment.amount_money.currency !== "USD") {
    return NextResponse.json({ error: "Only USD payments can be recorded here." }, { status: 409 });
  }

  if (invoice.quoteId) await recomputeDepositApplied(prisma, invoice.quoteId);

  if (!(await acquireChargeLock(invoice.id))) {
    return NextResponse.json({ error: "Another payment on this invoice is being recorded. Give it a moment." }, { status: 409 });
  }
  try {
    const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
    const balance = Math.max(0, invoiceBalance(fresh));
    const chargedTotal = payment.amount_money.amount / 100;
    // The page charged balance + the company's card surcharge; when Square's
    // figure matches that to the cent, split it the same way the pay page
    // does. Anything else (a tip added on Square's screen, a changed balance)
    // is recorded as principal so the money is never lost — the row's
    // details say what happened.
    const expectedSurcharge = invoice.company.surchargeEnabled
      ? calculateSurcharge(balance, Number(invoice.company.surchargeRate))
      : 0;
    const matchesSplit = Math.abs(chargedTotal - (balance + expectedSurcharge)) < 0.005;
    const surchargeAmount = matchesSplit ? expectedSurcharge : 0;
    const brand = payment.card_details?.card?.card_brand ?? null;
    const last4 = payment.card_details?.card?.last_4 ?? null;
    const cardLabel = brand ? `${brand.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}${last4 ? ` ${last4}` : ""}` : null;

    const { fullyPaid } = await recordPayment({
      companyId: actor.companyId,
      invoiceId: invoice.id,
      amount: chargedTotal,
      method: "CARD",
      processorRef: payment.id,
      surchargeAmount: surchargeAmount > 0 ? surchargeAmount : null,
      cardBrand: brand,
      cardType: payment.card_details?.card?.card_type ?? null,
      recordedById: actor.id,
      details: `Tap to Pay${cardLabel ? ` (${cardLabel})` : ""} — taken by ${actor.name}${matchesSplit ? "" : " · amount differs from the balance"}`,
    });

    if (surchargeAmount > 0) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { surcharge: Math.round((Number(fresh.surcharge ?? 0) + surchargeAmount) * 100) / 100 },
      }).catch((e) => reportError("[tap-to-pay] surcharge note failed", e));
    }

    if (fullyPaid && invoice.contact?.email) {
      await sendReviewRequest({
        companyId: actor.companyId,
        contactId: invoice.contact.id,
        jobId: invoice.jobId,
        email: invoice.contact.email,
        contactFirstName: invoice.contact.firstName,
        jobTitle: null,
      }).catch((e) => reportError("[tap-to-pay] review request failed", e));
    }

    logActivity({
      companyId: actor.companyId,
      userId: actor.id,
      userName: actor.name,
      entityType: "invoice",
      entityId: invoice.id,
      action: "tap_to_pay_charged",
      detail: `$${chargedTotal.toFixed(2)} by Tap to Pay${cardLabel ? ` (${cardLabel})` : ""}`,
    });

    return NextResponse.json({ success: true, amount: chargedTotal, fullyPaid });
  } finally {
    await releaseChargeLock(invoice.id);
  }
}
