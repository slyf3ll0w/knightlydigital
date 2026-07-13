import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { sendEmail, quoteLinkEmail } from "@/lib/email";
import { quoteDepositAmount, money } from "@/lib/statuses";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import { autoAdvance } from "@/lib/pipeline";

/**
 * POST — email the client their quote link and mark the quote sent.
 * The owner-initiated counterpart to "Copy client link": one click, the
 * client gets the approval page in their inbox, and the quote moves to
 * Awaiting Response (same lifecycle as Mark as Sent).
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
    include: {
      contact: true,
      company: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  if (!["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(quote.status)) {
    return NextResponse.json(
      { error: "This quote already has a client response — nothing to send." },
      { status: 400 }
    );
  }
  if (!quote.contact.email) {
    return NextResponse.json(
      { error: "This client has no email on file — add one, or share the quote with Copy client link." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";
  const deposit = quoteDepositAmount({
    total: Number(quote.total),
    depositType: quote.depositType,
    depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
  });
  const { subject, html } = quoteLinkEmail({
    companyName: quote.company.name,
    quoteNumber: quote.quoteNumber,
    total: Number(quote.total),
    viewUrl: `${baseUrl}/quote/${quote.publicToken}`,
    serviceNames: quote.lineItems
      .filter((li) => !(li.isOptional && li.optedOut))
      .map((li) => li.name || li.description || "Service"),
    depositNote:
      deposit > 0 ? `A deposit of ${money(deposit)} is due when you approve.` : undefined,
  });

  const emailed = await sendEmail({
    to: quote.contact.email,
    subject,
    html,
    replyTo: quote.company.email || undefined,
    fromName: quote.company.name,
    brand: quote.company,
  });
  if (!emailed) {
    return NextResponse.json(
      { error: "Email isn't set up on this server yet — share the quote with Copy client link instead." },
      { status: 502 }
    );
  }

  const justSent = !quote.sentAt;
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      ...(quote.status === "DRAFT" && { status: "AWAITING_RESPONSE" }),
      ...(justSent && { sentAt: new Date() }),
    },
  });
  // Sending the quote auto-issues any attached agreements set to "with quote"
  if (justSent) {
    await autoSendQuoteAgreements(quote.id, "WITH_QUOTE");
  }

  // Pipeline board: a sent quote advances the lead's card
  await autoAdvance(prisma, companyId, quote.contactId, "QUOTE_SENT");

  return NextResponse.json({ emailed: true, to: quote.contact.email });
}
