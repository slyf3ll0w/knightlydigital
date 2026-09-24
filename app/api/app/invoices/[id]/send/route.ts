import { NextRequest, NextResponse } from "next/server";
import { canChargeOnline } from "@/lib/payments-gate";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";
import { sendSms, canText, invoiceLinkText } from "@/lib/sms";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { dueDateFromTerms } from "@/lib/due-dates";
import { fireAutomations } from "@/lib/automations-server";

/**
 * POST — email the client their invoice pay link and mark the invoice sent.
 * One click from the invoice page; DRAFT invoices move to Awaiting Payment
 * (same lifecycle as Mark as Sent).
 */
export async function POST(
  _req: NextRequest,
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
    return NextResponse.json(previewBlockedError("Emailing invoices to clients"), { status: 403 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      company: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "This invoice is already paid." }, { status: 400 });
  }
  if (!invoice.contact?.email) {
    return NextResponse.json(
      { error: "This client has no email on file — add one, or share the invoice with Copy payment link." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  // No online payments for this company → the link views, it doesn't pay.
  const payable = canChargeOnline(invoice.company);
  const { subject, html } = invoiceLinkEmail({
    brand: invoice.company,
    companyName: invoice.company.name,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total),
    payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
    serviceNames: invoice.lineItems.map((li) => li.name || li.description || "Service"),
    payable,
  });

  const emailed = await sendEmail({
    companyId: invoice.companyId,
    to: invoice.contact.email,
    subject,
    html,
    replyTo: invoice.company.email || undefined,
    fromName: invoice.company.name,
  });
  if (!emailed) {
    return NextResponse.json(
      { error: "Email isn't set up on this server yet — share the invoice with Copy payment link instead." },
      { status: 424 }
    );
  }

  // Best-effort text with the same link — never fails the send.
  let texted = false;
  if (invoice.contact.phone && canText(invoice.contact)) {
    texted = await sendSms({
      companyId: invoice.companyId,
      contactId: invoice.contactId,
      to: invoice.contact.phone,
      text: invoiceLinkText({
        companyName: invoice.company.name,
        firstName: invoice.contact.firstName,
        invoiceNumber: invoice.invoiceNumber,
        total: Number(invoice.total),
        payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
        payable,
      }),
    });
  }

  // Sending IS issuing: stamp the dates a drafted engine invoice (or any
  // draft) never got, so A/R aging, the PAST_DUE flip, and payment reminders
  // can see it. Dates already set are left alone.
  const now = new Date();
  const patch = {
    ...(invoice.status === "DRAFT" ? { status: "AWAITING_PAYMENT" as const } : {}),
    ...(invoice.issuedAt ? {} : { issuedAt: now }),
    ...(invoice.dueDate
      ? {}
      : { dueDate: dueDateFromTerms(now, invoice.contact.paymentTermsDays) }),
  };
  if (Object.keys(patch).length > 0) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: patch });
  }
  // First send only (a re-send of an issued invoice is a reminder, not a send)
  if (invoice.status === "DRAFT") fireAutomations(invoice.companyId, "invoice.sent", invoice.id);

  return NextResponse.json({ emailed: true, texted, to: invoice.contact.email });
}
