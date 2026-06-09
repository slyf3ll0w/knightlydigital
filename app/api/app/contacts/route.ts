import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

async function getCompanyId() {
  const session = await getServerSession(authOptions);
  return session?.user.companyId ?? null;
}

export async function GET() {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await prisma.contact.findMany({
    where: { companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { firstName, lastName, email, phone, address, city, state, zip, notes } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      companyId,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      notes: notes || null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
