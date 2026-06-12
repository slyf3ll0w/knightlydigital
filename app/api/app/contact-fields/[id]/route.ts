import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

const validTypes = ["TEXT", "NUMBER", "DATE", "SELECT"];

function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 25);
}

/** PATCH — edit label/type/options/required, reorder, archive/restore. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const def = await prisma.contactFieldDef.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 80);
    if (!label) return NextResponse.json({ error: "A field name is required." }, { status: 400 });
    data.label = label;
  }
  if (body.type !== undefined && validTypes.includes(body.type)) data.type = body.type;
  if (body.options !== undefined) data.options = cleanOptions(body.options);
  if (body.required !== undefined) data.required = Boolean(body.required);
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
    data.sortOrder = Number(body.sortOrder);
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.contactFieldDef.update({ where: { id: def.id }, data });
  return NextResponse.json(updated);
}
