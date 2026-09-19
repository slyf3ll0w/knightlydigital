import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary } from "@/lib/estimator-server";

async function load(id: string, companyId: string) {
  return prisma.estimator.findFirst({ where: { id, companyId }, select: ESTIMATOR_SELECT });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row || (!row.isActive && !isManager(actor.role))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(row.spec);
  return NextResponse.json(spec ? { ...estimatorSummary(row, spec), spec } : { id: row.id, name: row.name, broken: true });
}

/** PATCH — { name?, description?, isActive?, spec? }. A new spec replaces the old one whole. */
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
      const dup = await prisma.estimator.findFirst({
        where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" }, NOT: { id: row.id } },
        select: { id: true },
      });
      if (dup) return NextResponse.json({ error: `A tool named "${name}" already exists.` }, { status: 409 });
    }
    data.name = name;
  }
  if (typeof body.description === "string" || body.description === null) {
    data.description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.spec !== undefined) {
    const check = await checkSpec(actor.companyId, body.spec);
    if (!check.ok) return NextResponse.json({ error: check.errors.join(" "), errors: check.errors }, { status: 400 });
    data.spec = check.compiled.spec;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const updated = await prisma.estimator.update({ where: { id: row.id }, data, select: ESTIMATOR_SELECT });
  const spec = specFromJson(updated.spec);
  return NextResponse.json(spec ? { ...estimatorSummary(updated, spec), spec } : { id: updated.id, name: updated.name, broken: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.estimator.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
