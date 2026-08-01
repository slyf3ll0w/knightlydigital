import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";

// Additional people on a client — a second contact at the same business, or a
// spouse on a household account. The Contact's own name/email/phone stay the
// primary; these ride alongside so one record still owns all the work.
//
// Enough is enough: a client with hundreds of "people" is a data-entry
// accident, not a use case, and the contact page renders them all.
const MAX_PEOPLE = 50;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const body = await req.json();
  const trimmed = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || null : null);

  const firstName = trimmed(body.firstName, 80);
  const lastName = trimmed(body.lastName, 80);
  if (!firstName && !lastName) {
    return NextResponse.json({ error: "Give this person a name." }, { status: 400 });
  }

  const count = await prisma.contactPerson.count({ where: { contactId: id } });
  if (count >= MAX_PEOPLE) {
    return NextResponse.json(
      { error: `A client can hold ${MAX_PEOPLE} additional contacts.` },
      { status: 400 }
    );
  }

  const created = await prisma.contactPerson.create({
    data: {
      contactId: id,
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      role: trimmed(body.role, 80),
      email: trimmed(body.email, 254)?.toLowerCase() ?? null,
      phone: trimmed(body.phone, 30),
      notes: trimmed(body.notes, 500),
      sortOrder: count,
    },
  });

  return NextResponse.json({ success: true, person: created });
}
