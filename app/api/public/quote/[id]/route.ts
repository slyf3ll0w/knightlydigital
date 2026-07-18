import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import { createDepositInvoice, type DepositInvoiceResult } from "@/lib/deposits";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";
import { recordLeadWin } from "@/lib/pipeline";

/**
 * Public quote response endpoint (client-facing, no auth — the [id] segment
 * is the quote's unguessable publicToken — never the database id).
 * Actions:
 *  - approve { signatureName, optedOutItemIds: string[] }
 *  - request_changes { message }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: token } = await params;
  const body = await req.json();
  const { action } = body;

  if (action !== "approve" && action !== "request_changes") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  if (typeof body.signatureName === "string" && body.signatureName.length > 120) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }
  if (typeof body.message === "string" && body.message.length > 5000) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { lineItems: true, contact: true, company: true },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  if (!["AWAITING_RESPONSE", "CHANGES_REQUESTED", "DRAFT"].includes(quote.status)) {
    return NextResponse.json({ error: "Quote is not in a reviewable state." }, { status: 400 });
  }

  if (action === "request_changes") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "CHANGES_REQUESTED",
        changeRequest: body.message || null,
      },
    });
    return NextResponse.json({ success: true });
  }

  // Approve: apply optional-item opt-outs, recompute totals, record signature
  const optedOut: string[] = Array.isArray(body.optedOutItemIds) ? body.optedOutItemIds : [];
  const validOptOuts = quote.lineItems
    .filter((li) => li.isOptional && optedOut.includes(li.id))
    .map((li) => li.id);

  const subtotal = quote.lineItems
    .filter((li) => !validOptOuts.includes(li.id))
    .reduce((s, li) => s + Number(li.total), 0);
  // Apply the quote's discount to the (opt-out-adjusted) subtotal BEFORE tax —
  // this must mirror the internal PATCH route and the client-facing approval
  // page (QuoteAcceptPage), or the approved total drifts above what the client
  // signed for and the deposit invoice is minted on the wrong amount.
  const discountValueRaw = quote.discountValue == null ? 0 : Number(quote.discountValue);
  const discount =
    quote.discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(Math.max(discountValueRaw, 0), 100)) / 100
      : quote.discountType === "FIXED"
        ? Math.min(Math.max(discountValueRaw, 0), subtotal)
        : 0;
  const taxable = subtotal - discount;
  const tax = quote.taxRate ? Math.round(taxable * Number(quote.taxRate) * 100) / 100 : null;
  const total = taxable + (tax ?? 0);

  const deposit: DepositInvoiceResult | null = await prisma.$transaction(async (tx) => {
    if (validOptOuts.length > 0) {
      await tx.quoteLineItem.updateMany({
        where: { id: { in: validOptOuts } },
        data: { optedOut: true },
      });
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        signatureName: body.signatureName || null,
        subtotal,
        discount: discount > 0 ? discount : null,
        tax,
        total,
      },
    });

    // Auto-issue the deposit invoice on approval (idempotent; no-op if no deposit)
    return createDepositInvoice(tx, {
      id: quote.id,
      companyId: quote.companyId,
      contactId: quote.contactId,
      quoteNumber: quote.quoteNumber,
      total,
      depositType: quote.depositType,
      depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
    });
  });

  // Approval issues any attached agreements set to "on approval"
  await autoSendQuoteAgreements(quote.id, "ON_APPROVAL");

  // Pipeline board: an approved quote converts the lead — their card lands in
  // the Converted section and they become an active client
  const boardContact = await prisma.contact.findUnique({
    where: { id: quote.contactId },
    select: { id: true, status: true, pipelineStageId: true },
  });
  if (boardContact) {
    await recordLeadWin(prisma, quote.companyId, boardContact);
  }

  // Email the client the deposit pay link when a deposit invoice was just created
  if (deposit?.created && quote.contact.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    const { subject, html } = invoiceLinkEmail({
      companyName: quote.company.name,
      invoiceNumber: deposit.invoice.invoiceNumber,
      total: deposit.amount,
      payUrl: `${baseUrl}/pay/${deposit.invoice.publicToken}`,
      serviceNames: [`Deposit for Quote #${quote.quoteNumber}`],
    });
    await sendEmail({
      to: quote.contact.email,
      subject,
      html,
      replyTo: quote.company.email || undefined,
      fromName: quote.company.name,
      brand: quote.company,
    });
  }

  return NextResponse.json({ success: true });
}
