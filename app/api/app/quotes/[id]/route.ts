import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";

const allowedStatuses = [
  "DRAFT",
  "AWAITING_RESPONSE",
  "APPROVED",
  "CHANGES_REQUESTED",
  "ARCHIVED",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  const body = await req.json();

  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.status === "AWAITING_RESPONSE" && !quote.sentAt && { sentAt: new Date() }),
      ...(body.status === "APPROVED" && { approvedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.status === "CONVERTED") {
    return NextResponse.json({ error: "Converted quotes can't be deleted." }, { status: 400 });
  }

  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
