import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const { firstName, lastName, email, phone, address, service, preferredDate, message } = body;

  if (!firstName || !lastName || !phone || !service) {
    return NextResponse.json({ error: "Required fields missing." }, { status: 400 });
  }

  await prisma.bookingRequest.create({
    data: {
      companyId: company.id,
      firstName,
      lastName,
      email: email || null,
      phone,
      address: address || null,
      service,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      message: message || null,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
