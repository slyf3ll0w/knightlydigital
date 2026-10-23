import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, contactScope } from "@/lib/permissions";
import { nextInvoiceNumber } from "@/lib/doc-numbers";
import { dueDateFromTerms } from "@/lib/due-dates";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { logActivity } from "@/lib/activity";
import { canText } from "@/lib/sms-consent";
import { companyCanSendSms } from "@/lib/sms";
import { quickChargeIssue, QUICK_CHARGE_DESCRIPTION_MAX } from "@/lib/quick-charge";

/**
 * POST — "Request payment": one amount and what it is for become a live pay
 * link in one call, with no invoice editor in between. Behind it is an
 * ordinary invoice (`kind: QUICK_CHARGE`, issued now, due today, status
 * AWAITING_PAYMENT) so every downstream piece — the /pay page, partial
 * payments, surcharge, reminders, QuickBooks, refunds, reports — treats it
 * like any other invoice. The client is optional: without one the link is
 * the only way to pay it (a walk-up, someone not saved yet).
 *
 * Body: { amount (dollars), description, contactId?, message?, taxRate? (fraction) }
 * Answers the share step: the link, an inline QR (SVG), and what the client
 * can be reached by right now.
 * Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 1.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await inPreview(actor.companyId)) {
    return NextResponse.json(previewBlockedError("Payment requests"), { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const amount = Math.round(Number(body?.amount) * 100) / 100;
  const description = String(body?.description ?? "").trim().slice(0, QUICK_CHARGE_DESCRIPTION_MAX);
  const contactId = typeof body?.contactId === "string" && body.contactId ? body.contactId : null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const taxRateRaw = Number(body?.taxRate);
  const taxRate = Number.isFinite(taxRateRaw) && taxRateRaw > 0 && taxRateRaw < 1 ? Math.round(taxRateRaw * 10000) / 10000 : 0;

  const issue = quickChargeIssue({ amount, description });
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });

  const contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, smsOptOut: true, smsDisabled: true },
      })
    : null;
  if (contactId && !contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const tax = taxRate > 0 ? Math.round(amount * taxRate * 100) / 100 : 0;
  const total = Math.round((amount + tax) * 100) / 100;
  const now = new Date();

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx, actor.companyId);
    return tx.invoice.create({
      data: {
        companyId: actor.companyId,
        contactId: contact?.id ?? null,
        publicToken: randomBytes(24).toString("hex"),
        kind: "QUICK_CHARGE",
        invoiceNumber,
        subject: description,
        status: "AWAITING_PAYMENT",
        subtotal: amount,
        taxRate: tax > 0 ? taxRate : null,
        tax: tax > 0 ? tax : null,
        total,
        clientMessage: message || null,
        issuedAt: now,
        dueDate: dueDateFromTerms(now, 0),
        lineItems: {
          create: [{ name: description, description: "", quantity: 1, unitPrice: amount, total: amount, sortOrder: 0 }],
        },
      },
      select: { id: true, invoiceNumber: true, publicToken: true, total: true },
    });
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
  const payUrl = `${baseUrl}/pay/${invoice.publicToken}`;
  // Inline SVG so the share step can show it with no second request; the
  // client scans it from the tech's screen.
  const qrSvg = await QRCode.toString(payUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).catch(() => "");

  const canTextClient = Boolean(contact?.phone) && canText(contact!) && (await companyCanSendSms(actor.companyId));

  logActivity({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "invoice",
    entityId: invoice.id,
    action: "payment_requested",
    detail: `$${total.toFixed(2)} — ${description}`,
  });

  return NextResponse.json({
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, publicToken: invoice.publicToken, total },
    payUrl,
    qrSvg,
    contact: contact
      ? {
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          canText: canTextClient,
        }
      : null,
  });
}
