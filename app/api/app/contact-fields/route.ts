import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { getActiveFieldDefs } from "@/lib/contact-fields";

const validTypes = ["TEXT", "NUMBER", "DATE", "SELECT"];

function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 25);
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getActiveFieldDefs(actor.companyId));
}

/** POST — add a custom client field (managers). */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  if (!label) return NextResponse.json({ error: "A field name is required." }, { status: 400 });
  const type = validTypes.includes(body.type) ? body.type : "TEXT";
  const options = type === "SELECT" ? cleanOptions(body.options) : [];
  if (type === "SELECT" && options.length < 2) {
    return NextResponse.json({ error: "Dropdown fields need at least two choices." }, { status: 400 });
  }

  const count = await prisma.contactFieldDef.count({
    where: { companyId: actor.companyId, isActive: true },
  });
  if (count >= 20) {
    return NextResponse.json({ error: "Limit of 20 active custom fields reached." }, { status: 400 });
  }
  const last = await prisma.contactFieldDef.findFirst({
    where: { companyId: actor.companyId },
    orderBy: { sortOrder: "desc" },
  });

  const def = await prisma.contactFieldDef.create({
    data: {
      companyId: actor.companyId,
      label,
      type,
      options,
      required: Boolean(body.required),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json(def, { status: 201 });
}
