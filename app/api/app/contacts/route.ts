import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope, isManager } from "@/lib/permissions";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";
import { enterPipeline } from "@/lib/pipeline";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Picker feed (new job/request forms) — archived clients stay out
  const contacts = await prisma.contact.findMany({
    where: {
      companyId: actor.companyId,
      ...contactScope(actor),
      status: { in: ["LEAD", "ACTIVE"] },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { firstName, lastName, companyName, email, phone, address, city, state, zip, notes, leadSource } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  }

  let paymentTermsDays: number | undefined;
  if (body.paymentTermsDays !== undefined) {
    const n = Number(body.paymentTermsDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "Payment terms must be between 0 and 365 days." },
        { status: 400 }
      );
    }
    paymentTermsDays = n;
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
      companyName: companyName || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      notes: notes || null,
      leadSource: leadSource || null,
      ...(paymentTermsDays !== undefined && { paymentTermsDays }),
      assignedToId,
      customFields:
        body.customFields !== undefined
          ? sanitizeCustomFields(body.customFields, await getActiveFieldDefs(actor.companyId))
          : undefined,
    },
  });

  // New contacts start as leads — straight onto the pipeline board
  await enterPipeline(prisma, actor.companyId, contact.id);

  return NextResponse.json(contact, { status: 201 });
}
