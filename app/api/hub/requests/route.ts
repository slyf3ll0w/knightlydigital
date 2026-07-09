import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, newRequestEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";

/** Public: a client submits a work request from their hub. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, title, details } = body;

  if (!token || !title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: { company: { select: { name: true, email: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });

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

  const last = await prisma.request.findFirst({
    where: { companyId: contact.companyId },
    orderBy: { requestNumber: "desc" },
  });

  const request = await prisma.request.create({
    data: {
      companyId: contact.companyId,
      contactId: contact.id,
      requestNumber: (last?.requestNumber ?? 0) + 1,
      title: String(title).slice(0, 200),
      details: details ? String(details).slice(0, 5000) : null,
      source: "client_hub",
    },
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
      to: notifyTo,
      subject,
      html,
      replyTo: contact.email ?? undefined,
    });
  }

  return NextResponse.json({ id: request.id }, { status: 201 });
}
