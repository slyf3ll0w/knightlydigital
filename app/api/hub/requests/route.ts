import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, newRequestEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { withDocNumberRetry } from "@/lib/doc-numbers";

/**
 * Public: a client submits a work request from their hub ("Request more work").
 *
 * This deliberately does NOT touch the Leads board. An existing client asking
 * for more work is repeat business, not a lead to be re-sold — the request
 * lands in Requests, the team gets notified, and the client's status stays
 * exactly as it is. (Cold intake — booking forms, the lead webhook — is what
 * calls enterPipeline/autoAdvance.)
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, title, details } = body;

  if (!token || !title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: { company: { select: { name: true, email: true, suspendedAt: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });
  if (contact.company.suspendedAt) {
    // Paused account: nothing new comes in until support reinstates it.
    return NextResponse.json(
      { error: "This business isn't accepting requests online right now. Please contact them directly." },
      { status: 503 }
    );
  }

  // Backstop: cap requests per company per day (matches the booking form)
  const recent = await prisma.request.count({
    where: { companyId: contact.companyId, createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  if (recent >= 200) {
    return NextResponse.json(
      { error: "Too many requests today. Please call instead." },
      { status: 429 }
    );
  }

  // Retried so a request coming in while the office is creating one doesn't
  // die on the requestNumber unique constraint and lose the client's ask.
  const request = await withDocNumberRetry(async () => {
    const last = await prisma.request.findFirst({
      where: { companyId: contact.companyId },
      orderBy: { requestNumber: "desc" },
      select: { requestNumber: true },
    });
    return prisma.request.create({
      data: {
        companyId: contact.companyId,
        contactId: contact.id,
        requestNumber: (last?.requestNumber ?? 0) + 1,
        title: String(title).slice(0, 200),
        details: details ? String(details).slice(0, 5000) : null,
        source: "client_hub",
      },
    });
  });

  // Push to the owner(s), lead assignee, and this client's salesperson
  await notifyUsers(await requestNotifyUserIds(contact.companyId, contact.assignedToId), {
    title: `New request from ${contact.firstName} ${contact.lastName}`,
    body: request.title,
    url: `/app/requests/${request.id}`,
    tag: `request-${request.id}`,
  });

  // Notify the company inbox; reply goes straight to the customer
  const notifyTo = await companyNotifyAddress(contact.companyId, contact.company.email);
  if (notifyTo) {
    const { subject, html } = newRequestEmail({
      companyName: contact.company.name,
      requestId: request.id,
      requestNumber: request.requestNumber,
      title: request.title,
      details: request.details,
      contactName: `${contact.firstName} ${contact.lastName}`,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      source: "client_hub",
    });
    await sendEmail({
      companyId: contact.companyId,
      to: notifyTo,
      subject,
      html,
      replyTo: contact.email ?? undefined,
    });
  }

  return NextResponse.json({ id: request.id }, { status: 201 });
}
