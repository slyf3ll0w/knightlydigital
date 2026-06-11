import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";

export async function GET() {
  // Read access for anyone who builds quotes (price-book autocomplete)
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { name, description, type, unitPrice, unitCost } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const item = await prisma.workItem.create({
    data: {
      companyId,
      name: String(name).trim(),
      description: description?.trim() || null,
      type: type === "PRODUCT" ? "PRODUCT" : "SERVICE",
      unitPrice: Number(unitPrice) || 0,
      unitCost: unitCost !== null && unitCost !== undefined && unitCost !== "" ? Number(unitCost) : null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
