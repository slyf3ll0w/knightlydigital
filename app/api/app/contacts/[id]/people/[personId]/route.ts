import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import type { Actor } from "@/lib/permissions";

async function findScoped(actor: Actor, contactId: string, personId: string) {
  return prisma.contactPerson.findFirst({
    where: {
      id: personId,
      contactId,
      contact: { companyId: actor.companyId, ...contactScope(actor) },
    },
    select: { id: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, personId } = await params;
  const existing = await findScoped(actor, id, personId);
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const body = await req.json();
  const trimmed = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || null : null);

  // A name can be edited to blank on one half, but not on both — that would
  // leave an unlabelled row nobody can identify.
  const firstName = body.firstName !== undefined ? (trimmed(body.firstName, 80) ?? "") : undefined;
  const lastName = body.lastName !== undefined ? (trimmed(body.lastName, 80) ?? "") : undefined;
  if (firstName !== undefined && lastName !== undefined && !firstName && !lastName) {
    return NextResponse.json({ error: "Give this person a name." }, { status: 400 });
  }

  const updated = await prisma.contactPerson.update({
    where: { id: personId },
    data: {
      firstName,
      lastName,
      role: body.role !== undefined ? trimmed(body.role, 80) : undefined,
      email:
        body.email !== undefined ? (trimmed(body.email, 254)?.toLowerCase() ?? null) : undefined,
      phone: body.phone !== undefined ? trimmed(body.phone, 30) : undefined,
      notes: body.notes !== undefined ? trimmed(body.notes, 500) : undefined,
    },
  });

  return NextResponse.json({ success: true, person: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, personId } = await params;
  const existing = await findScoped(actor, id, personId);
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  await prisma.contactPerson.delete({ where: { id: personId } });
  return NextResponse.json({ success: true });
}
