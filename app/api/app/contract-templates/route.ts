import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const templates = await prisma.contractTemplate.findMany({
    where: { companyId: actor.companyId, isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(templates);
}

/** POST — save a reusable contract template (managers). */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 50000) : "";
  if (!name || !text) {
    return NextResponse.json({ error: "Name and contract text are required." }, { status: 400 });
  }

  const template = await prisma.contractTemplate.create({
    data: { companyId: actor.companyId, name, body: text },
  });
  return NextResponse.json(template, { status: 201 });
}
