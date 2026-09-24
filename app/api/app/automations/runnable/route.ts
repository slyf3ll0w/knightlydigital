import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { specFromJson, type EntityType } from "@/lib/automations";

export const dynamic = "force-dynamic";

const RUNNABLE: readonly EntityType[] = ["contact", "job", "quote", "invoice"];

/**
 * GET ?entity=job — the active "Run on a record" automations for that kind
 * of record, for the Run menu on client / job / quote / invoice pages.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json([]);
  const entity = (req.nextUrl.searchParams.get("entity") ?? "") as EntityType;
  if (!RUNNABLE.includes(entity)) return NextResponse.json({ error: "entity must be contact, job, quote or invoice" }, { status: 400 });
  const rows = await prisma.automation.findMany({
    where: { companyId: actor.companyId, isActive: true, spec: { path: ["trigger", "event"], equals: "manual.run" } },
    select: { id: true, name: true, spec: true },
    orderBy: { name: "asc" },
  });
  const out = rows.flatMap((r) => {
    const spec = specFromJson(r.spec);
    return spec && (spec.trigger.entity ?? "contact") === entity ? [{ id: r.id, name: r.name }] : [];
  });
  return NextResponse.json(out);
}
