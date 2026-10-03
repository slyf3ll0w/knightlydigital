import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { sendEmail, quoteLinkEmail } from "@/lib/email";
import { quoteDepositAmount, money } from "@/lib/statuses";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import { autoAdvance } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { sendSms, canText, companyCanSendSms, quoteLinkText } from "@/lib/sms";
import { readSendChannels } from "@/lib/send-channels";

/**
 * POST — email the client their quote link and mark the quote sent.
 * The owner-initiated counterpart to "Copy client link": one click, the
 * client gets the approval page in their inbox, and the quote moves to
 * Awaiting Response (same lifecycle as Mark as Sent).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sends cost money (email/SMS) and land in a client's inbox — cap per
  // company so one compromised login can't mailbomb or run up the bill
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Emailing quotes to clients"), { status: 403 });
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
  // Email by default; a text from the business line only when the sender
  // ticks it (components/SendChoice.tsx) — quote texts stayed off by default
  // after the 2026-09-24 campaign review read them as marketing.
  const channels = await readSendChannels(req, { email: true, text: false });
  const contact = quote.contact;
  const textable = channels.text && Boolean(contact.phone) && canText(contact) && (await companyCanSendSms(quote.companyId));
  const emailable = channels.email && Boolean(contact.email);
  if (!emailable && !textable) {
    return NextResponse.json(
      { error: "This client has no email or textable phone on file — add one, or share the quote with Copy client link." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const deposit = quoteDepositAmount({
    total: Number(quote.total),
    depositType: quote.depositType,
    depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
  });
  const { subject, html } = quoteLinkEmail({
    brand: quote.company,
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

  const emailed =
    emailable && contact.email
      ? await sendEmail({
          companyId: quote.companyId,
          to: contact.email,
          subject,
          html,
          replyTo: quote.company.email || undefined,
          fromName: quote.company.name,
        })
      : false;
  let texted = false;
  if (textable && contact.phone) {
    texted = await sendSms({
      companyId: quote.companyId,
      contactId: quote.contactId,
      to: contact.phone,
      text: quoteLinkText({
        companyName: quote.company.name,
        firstName: contact.firstName,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        viewUrl: `${baseUrl}/quote/${quote.publicToken}`,
      }),
    });
  }
  if (!emailed && !texted) {
    return NextResponse.json(
      {
        error: emailable
          ? "Email isn't set up on this server yet — share the quote with Copy client link instead."
          : "The text didn't go out — check Text Notifications in Settings → Phone & texting, or share the quote with Copy client link.",
      },
      { status: 424 }
    );
  }

  const justSent = !quote.sentAt;
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      // A re-sent change-request goes back to Awaiting Response — the client
      // has a fresh document to review
      ...((quote.status === "DRAFT" || quote.status === "CHANGES_REQUESTED") && {
        status: "AWAITING_RESPONSE",
      }),
      ...(justSent && { sentAt: new Date() }),
    },
  });
  // Sending the quote auto-issues any attached agreements set to "with quote"
  if (justSent) {
    await autoSendQuoteAgreements(quote.id, "WITH_QUOTE");
  }

  // Pipeline board: a sent quote advances the lead's card
  await autoAdvance(prisma, companyId, quote.contactId, "QUOTE_SENT");
  if (justSent) fireAutomations(companyId, "quote.sent", quote.id);

  return NextResponse.json({ emailed, texted, to: emailed ? contact.email : null, phone: texted ? contact.phone : null });
}
