import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/** DELETE — remove the client's card on file (staff side, managers only). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { processorCustomerRef: null, savedCardLabel: null, savedCardAt: null },
  });
  return NextResponse.json({ removed: true });
}
