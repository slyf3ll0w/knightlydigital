import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import type { Actor } from "@/lib/permissions";

async function findScoped(actor: Actor, contactId: string, addressId: string) {
  return prisma.contactAddress.findFirst({
    where: {
      id: addressId,
      contactId,
      contact: { companyId: actor.companyId, ...contactScope(actor) },
    },
    select: { id: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; addressId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, addressId } = await params;
  const existing = await findScoped(actor, id, addressId);
  if (!existing) return NextResponse.json({ error: "Address not found." }, { status: 404 });

  const body = await req.json();
  const trimmed = (v: unknown, max: number) =>
    v ? String(v).trim().slice(0, max) || null : null;
  const address = body.address !== undefined ? String(body.address).trim().slice(0, 200) : undefined;
  if (address === "") return NextResponse.json({ error: "Street address is required." }, { status: 400 });

  const updated = await prisma.contactAddress.update({
    where: { id: addressId },
    data: {
      address,
      label: body.label !== undefined ? trimmed(body.label, 60) : undefined,
      city: body.city !== undefined ? trimmed(body.city, 100) : undefined,
      state: body.state !== undefined ? trimmed(body.state, 40) : undefined,
      zip: body.zip !== undefined ? trimmed(body.zip, 20) : undefined,
    },
  });

  return NextResponse.json({ success: true, address: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; addressId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, addressId } = await params;
  const existing = await findScoped(actor, id, addressId);
  if (!existing) return NextResponse.json({ error: "Address not found." }, { status: 404 });

  await prisma.contactAddress.delete({ where: { id: addressId } });
  return NextResponse.json({ success: true });
}
