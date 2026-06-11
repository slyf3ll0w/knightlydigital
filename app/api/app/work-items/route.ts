import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

async function getCompanyId() {
  const session = await getServerSession(authOptions);
  return session?.user.companyId ?? null;
}

export async function GET() {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
