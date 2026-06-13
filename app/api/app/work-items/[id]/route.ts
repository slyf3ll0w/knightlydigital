import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { sanitizeRecurringAndAgreement } from "@/lib/work-items";

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

  // Recurring + agreement settings are revalidated together (the gate flag is
  // derived from the attached template, so it can't be patched independently).
  const recurring = await sanitizeRecurringAndAgreement(body, companyId);
  if ("error" in recurring) {
    return NextResponse.json({ error: recurring.error }, { status: 400 });
  }

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
      ...recurring.data,
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
