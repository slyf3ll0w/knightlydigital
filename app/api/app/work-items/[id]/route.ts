import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

// Price-book edits are settings territory: managers only
async function getCompanyId() {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return null;
  return actor.companyId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.workItem.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: String(body.name).trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.type !== undefined && { type: body.type === "PRODUCT" ? "PRODUCT" : "SERVICE" }),
      ...(body.unitPrice !== undefined && { unitPrice: Number(body.unitPrice) || 0 }),
      ...(body.unitCost !== undefined && {
        unitCost: body.unitCost === null || body.unitCost === "" ? null : Number(body.unitCost),
      }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  await prisma.workItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
