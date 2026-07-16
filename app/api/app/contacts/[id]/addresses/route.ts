import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";

// Additional service addresses for a contact (the flat fields on Contact
// stay the primary address; these are extras like rentals or a second shop).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const address = String(body.address ?? "").trim().slice(0, 200);
  if (!address) return NextResponse.json({ error: "Street address is required." }, { status: 400 });

  const trimmed = (v: unknown, max: number) =>
    v ? String(v).trim().slice(0, max) || null : null;

  const created = await prisma.contactAddress.create({
    data: {
      contactId: id,
      label: trimmed(body.label, 60),
      address,
      city: trimmed(body.city, 100),
      state: trimmed(body.state, 40),
      zip: trimmed(body.zip, 20),
    },
  });

  return NextResponse.json({ success: true, address: created });
}
