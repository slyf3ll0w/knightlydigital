import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { recordPayment, invoiceBalance } from "@/lib/payments";
import type { PaymentMethod } from "@prisma/client";
import { inPreview, previewBlockedError } from "@/lib/preview";

const validMethods = [
  "CARD",
  "ACH",
  "CASH",
  "CHECK",
  "CASH_APP",
  "PAYPAL",
  "VENMO",
  "ZELLE",
  "OTHER",
];

/**
 * POST — record a payment against an invoice (Jobber's "Collect Payment").
 * Manual methods record immediately; card/ACH will route through the payment
 * processor once it's live.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Recording payments"), { status: 403 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { invoiceId, amount, method, referenceNumber, details, paidAt, emailReceipt } = body;

  if (!invoiceId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Invoice and a positive amount are required." }, { status: 400 });
  }
  if (!validMethods.includes(method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId, ...viaContactScope(actor) },
    include: { payments: { select: { amount: true, surchargeAmount: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  // A payment against a settled or shelved invoice is a bookkeeping mistake
  // (wrong invoice picked), and an overpayment silently flips the invoice to
  // PAID with the excess unaccounted for. Both get a clear no.
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "This invoice is already paid in full." }, { status: 400 });
  }
  if (invoice.status === "ARCHIVED") {
    return NextResponse.json(
      { error: "This invoice is archived — reopen it before recording a payment." },
      { status: 400 }
    );
  }
  const balance = invoiceBalance(invoice);
  if (Number(amount) > balance + 0.005) {
    return NextResponse.json(
      { error: `That's more than the $${balance.toFixed(2)} still owed on this invoice.` },
      { status: 400 }
    );
  }

  try {
    const { payment, fullyPaid } = await recordPayment({
      companyId,
      invoiceId,
      amount: Number(amount),
      method: method as PaymentMethod,
      referenceNumber: referenceNumber || null,
      details: details || null,
      paidAt: paidAt
        ? new Date(paidAt.length === 10 ? `${paidAt}T12:00:00` : paidAt)
        : undefined,
      recordedById: actor.id,
      // Manual records only email a receipt when the form asked for it —
      // backfilled bookkeeping entries shouldn't surprise the client.
      emailReceipt: emailReceipt === true,
    });
    return NextResponse.json({ payment, fullyPaid }, { status: 201 });
  } catch (e) {
    // recordPayment's own "Invoice not found" is pre-checked above (scoped),
    // so anything landing here is a DB/email failure — log it and keep the
    // internals (Prisma messages, table names) out of the response.
    console.error("[payments] recordPayment failed:", e);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
