import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { compileAutomation } from "@/lib/automations";
import { AUTOMATION_SELECT, automationShape as shape } from "@/lib/automations-server";

async function load(id: string, companyId: string) {
  return prisma.automation.findFirst({ where: { id, companyId }, select: AUTOMATION_SELECT });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const runs = await prisma.automationRun.findMany({ where: { automationId: row.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ ...shape(row), recentRuns: runs });
}

/** PATCH — { name?, description?, isActive?, spec? }; a new spec replaces the old whole. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { name?: string; description?: string | null; isActive?: boolean; spec?: object } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (name.toLowerCase() !== row.name.toLowerCase()) {
      const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" }, NOT: { id: row.id } }, select: { id: true } });
      if (dup) return NextResponse.json({ error: `An automation named "${name}" already exists.` }, { status: 409 });
    }
    data.name = name;
  }
  if (typeof body.description === "string" || body.description === null) data.description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.spec !== undefined) {
    const c = compileAutomation(body.spec);
    if (!c.ok) return NextResponse.json({ error: c.errors.join(" "), errors: c.errors }, { status: 400 });
    data.spec = c.compiled.spec;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const updated = await prisma.automation.update({ where: { id: row.id }, data, select: AUTOMATION_SELECT });
  return NextResponse.json(shape(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.automation.delete({ where: { id: row.id } }); // runs cascade
  return NextResponse.json({ ok: true });
}
