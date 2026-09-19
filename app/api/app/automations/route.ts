import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { AUTOMATION_LIMITS, compileAutomation } from "@/lib/automations";
import { AUTOMATION_SELECT, automationShape as shape } from "@/lib/automations-server";

/**
 * Automations (docs/plans/ai-estimators-2026-09-19.md, Batch 2). Managers only.
 * GET — every rule with its plain-English summary. POST — create
 * { name, description?, spec }; this is what the Atlas card confirms into,
 * so it re-validates the spec itself.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.automation.findMany({ where: { companyId: actor.companyId }, select: AUTOMATION_SELECT, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return NextResponse.json(rows.map(shape));
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;

  const count = await prisma.automation.count({ where: { companyId: actor.companyId } });
  if (count >= AUTOMATION_LIMITS.perCompany) return NextResponse.json({ error: `Limit of ${AUTOMATION_LIMITS.perCompany} automations reached.` }, { status: 400 });
  const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (dup) return NextResponse.json({ error: `An automation named "${name}" already exists.` }, { status: 409 });

  const c = compileAutomation(body.spec);
  if (!c.ok) return NextResponse.json({ error: c.errors.join(" "), errors: c.errors }, { status: 400 });

  const row = await prisma.automation.create({
    data: { companyId: actor.companyId, name, description, spec: c.compiled.spec, createdById: actor.id },
    select: AUTOMATION_SELECT,
  });
  return NextResponse.json(shape(row), { status: 201 });
}
