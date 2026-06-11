import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contacts = await prisma.contact.findMany({
    where: { companyId: actor.companyId, ...contactScope(actor) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { firstName, lastName, email, phone, address, city, state, zip, notes, leadSource } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  }

  // Managers may assign to anyone in the company; sales/user always own
  // the leads they create.
  let assignedToId = actor.id;
  if (isManager(actor.role) && body.assignedToId) {
    const target = await prisma.user.findFirst({
      where: { id: body.assignedToId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (target) assignedToId = target.id;
  }

  const contact = await prisma.contact.create({
    data: {
      companyId: actor.companyId,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      notes: notes || null,
      leadSource: leadSource || null,
      assignedToId,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
