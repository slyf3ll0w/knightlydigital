import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { AUTOMATION_LIMITS, compileAutomation } from "@/lib/automations";
import { AUTOMATION_SELECT, automationShape as shape, mintWebhookToken } from "@/lib/automations-server";

/**
 * Automations (docs/plans/automations-builder-2026-09-24.md). Managers only.
 * GET — every rule with its plain-English summary. POST — create
 * { name, description?, spec }; the builder page and the Atlas card both
 * land here, so it re-validates the spec itself. A webhook-triggered rule
 * gets its secret URL token minted on create.
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
  const isActive = body.isActive === false ? false : true;

  const count = await prisma.automation.count({ where: { companyId: actor.companyId } });
  if (count >= AUTOMATION_LIMITS.perCompany) return NextResponse.json({ error: `Limit of ${AUTOMATION_LIMITS.perCompany} automations reached.` }, { status: 400 });
  const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (dup) return NextResponse.json({ error: `An automation named "${name}" already exists.` }, { status: 409 });

  const c = compileAutomation(body.spec);
  if (!c.ok) return NextResponse.json({ error: c.errors.join(" "), errors: c.errors }, { status: 400 });

  const row = await prisma.automation.create({
    data: {
      companyId: actor.companyId, name, description, spec: c.compiled.spec, isActive, createdById: actor.id,
      webhookToken: c.compiled.spec.trigger.event === "webhook.received" ? mintWebhookToken() : null,
    },
    select: AUTOMATION_SELECT,
  });
  return NextResponse.json(shape(row), { status: 201 });
}
