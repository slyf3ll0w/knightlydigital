import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";

// Generous backstop so one runaway account or bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

/**
 * Public booking form. Creates (or matches) a contact and files a Request so
 * the booking lands in the company's Requests workflow (Jobber's request form
 * works the same way).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

  if (!(await verifyCaptcha(body.captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const { firstName, lastName, email, phone, address, service, preferredDate, message } = body;

  if (!firstName || !lastName || !phone || !service) {
    return NextResponse.json({ error: "Required fields missing." }, { status: 400 });
  }
  const tooLong = [firstName, lastName, email, phone, address, service].some(
    (v) => v && String(v).length > 200
  );
  if (tooLong || (message && String(message).length > 5000)) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({
    where: { companyId: company.id, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json(
      { error: "This business can't accept more requests right now. Please call instead." },
      { status: 429 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Match an existing contact by phone or email; otherwise create a lead
    let contact = await tx.contact.findFirst({
      where: {
        companyId: company.id,
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          companyId: company.id,
          firstName,
          lastName,
          email: email || null,
          phone,
          address: address || null,
          leadSource: "Online booking",
        },
      });
    }

    const last = await tx.request.findFirst({
      where: { companyId: company.id },
      orderBy: { requestNumber: "desc" },
    });

    await tx.request.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        requestNumber: (last?.requestNumber ?? 0) + 1,
        title: service,
        details: [
          message,
          preferredDate ? `Preferred date: ${preferredDate}` : null,
          address ? `Address: ${address}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        source: "booking_form",
      },
    });
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
