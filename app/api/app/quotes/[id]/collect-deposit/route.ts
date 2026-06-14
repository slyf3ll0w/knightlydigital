import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { createDepositInvoice } from "@/lib/deposits";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";

/**
 * POST — manually issue (or re-send) the deposit invoice for a quote. The
 * business-initiated counterpart to the auto-issue on client approval. Idempotent:
 * a quote has at most one deposit invoice, so this returns the existing one and
 * (optionally) re-emails the pay link.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { contact: true, company: true },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.status === "ARCHIVED") {
    return NextResponse.json({ error: "This quote is archived." }, { status: 400 });
  }

  const deposit = await prisma.$transaction((tx) =>
    createDepositInvoice(tx, {
      id: quote.id,
      companyId: quote.companyId,
      contactId: quote.contactId,
      quoteNumber: quote.quoteNumber,
      total: Number(quote.total),
      depositType: quote.depositType,
      depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
    })
  );

  if (!deposit) {
    return NextResponse.json({ error: "This quote has no deposit set." }, { status: 400 });
  }

  // Email the client the pay link (whether freshly created or re-sent)
  if (quote.contact.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
    const { subject, html } = invoiceLinkEmail({
      companyName: quote.company.name,
      invoiceNumber: deposit.invoice.invoiceNumber,
      total: deposit.amount,
      payUrl: `${baseUrl}/pay/${deposit.invoice.publicToken}`,
      serviceNames: [`Deposit for Quote #${quote.quoteNumber}`],
    });
    await sendEmail({ to: quote.contact.email, subject, html, replyTo: quote.company.email || undefined });
  }

  return NextResponse.json(
    { invoiceId: deposit.invoice.id, invoiceNumber: deposit.invoice.invoiceNumber, amount: deposit.amount, created: deposit.created },
    { status: deposit.created ? 201 : 200 }
  );
}
