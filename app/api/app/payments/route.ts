import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { recordPayment } from "@/lib/payments";
import type { PaymentMethod } from "@prisma/client";

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
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { invoiceId, amount, method, referenceNumber, details, paidAt } = body;

  if (!invoiceId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Invoice and a positive amount are required." }, { status: 400 });
  }
  if (!validMethods.includes(method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId, ...viaContactScope(actor) },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

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
    });
    return NextResponse.json({ payment, fullyPaid }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to record payment." },
      { status: 500 }
    );
  }
}
