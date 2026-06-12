import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";

/** POST — add a note to a client/lead (same shape as job notes). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: contactId } = await params;
  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const note = await prisma.contactNote.create({
    data: { contactId, userId: actor.id, body: String(body).trim().slice(0, 5000) },
  });
  return NextResponse.json(note, { status: 201 });
}
