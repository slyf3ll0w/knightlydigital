import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";
import { sendSms, invoiceLinkText } from "@/lib/sms";

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
  const { subject, html } = invoiceLinkEmail({
    companyName: invoice.company.name,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total),
    payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
    serviceNames: invoice.lineItems.map((li) => li.name || li.description || "Service"),
  });

  const emailed = await sendEmail({
    to: invoice.contact.email,
    subject,
    html,
    replyTo: invoice.company.email || undefined,
    fromName: invoice.company.name,
    brand: invoice.company,
  });
  if (!emailed) {
    return NextResponse.json(
      { error: "Email isn't set up on this server yet — share the invoice with Copy payment link instead." },
      { status: 502 }
    );
  }

  // Best-effort text with the same link — never fails the send.
  let texted = false;
  if (invoice.contact.phone && !invoice.contact.smsOptOut) {
    texted = await sendSms({
      to: invoice.contact.phone,
      text: invoiceLinkText({
        companyName: invoice.company.name,
        firstName: invoice.contact.firstName,
        invoiceNumber: invoice.invoiceNumber,
        total: Number(invoice.total),
        payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
      }),
    });
  }

  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "AWAITING_PAYMENT" },
    });
  }

  return NextResponse.json({ emailed: true, texted, to: invoice.contact.email });
}
