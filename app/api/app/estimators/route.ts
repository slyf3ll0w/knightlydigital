import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager } from "@/lib/permissions";
import { ESTIMATOR_LIMITS, specFromJson } from "@/lib/estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary, publicSlugTaken } from "@/lib/estimator-server";
import { publicSlugFrom, sanitizePublicConfig } from "@/lib/estimator-public";

/**
 * Estimate tools (docs/plans/ai-estimators-2026-09-19.md).
 *
 * GET — the company's tools. Sellers see active tools with their specs (the
 * quote editor's runner needs the inputs); managers also see inactive ones.
 * POST — create: { name, description?, spec, isPublic?, publicSlug?, publicConfig? }. The spec must compile and
 * every price-book item it references must exist; this is the route the
 * Atlas card confirms into, so it re-validates everything itself.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const manager = isManager(actor.role);
  const rows = await prisma.estimator.findMany({
    where: { companyId: actor.companyId, ...(manager ? {} : { isActive: true }) },
    select: ESTIMATOR_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const spec = specFromJson(r.spec);
    if (!spec) {
      if (manager) out.push(estimatorBroken(r));
      continue;
    }
    out.push({ ...estimatorSummary(r, spec), spec });
  }
  return NextResponse.json(out);
}

function estimatorBroken(r: { id: string; name: string; description: string | null; isActive: boolean }) {
  return { id: r.id, name: r.name, description: r.description, isActive: r.isActive, broken: true, usesAtlas: false, inputs: [], lines: 0, runs: 0, assists: 0 };
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;

  const count = await prisma.estimator.count({ where: { companyId: actor.companyId } });
  if (count >= ESTIMATOR_LIMITS.perCompany) {
    return NextResponse.json({ error: `Limit of ${ESTIMATOR_LIMITS.perCompany} estimate tools reached.` }, { status: 400 });
  }
  const dup = await prisma.estimator.findFirst({
    where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: `A tool named "${name}" already exists.` }, { status: 409 });

  const check = await checkSpec(actor.companyId, body.spec);
  if (!check.ok) return NextResponse.json({ error: check.errors.join(" "), errors: check.errors }, { status: 400 });

  // Website form, when the card asked for one (lib/estimator-public.ts)
  const isPublic = body.isPublic === true;
  let publicSlug: string | null = null;
  if (isPublic || typeof body.publicSlug === "string") {
    publicSlug = publicSlugFrom(typeof body.publicSlug === "string" && body.publicSlug ? body.publicSlug : name) || null;
    if (publicSlug && (await publicSlugTaken(actor.companyId, publicSlug))) publicSlug = `${publicSlug}-${Date.now().toString(36).slice(-4)}`;
  }
  const publicConfig = body.publicConfig !== undefined ? sanitizePublicConfig(body.publicConfig) : undefined;

  const row = await prisma.estimator.create({
    data: { companyId: actor.companyId, name, description, spec: check.compiled.spec, isPublic: isPublic && Boolean(publicSlug), publicSlug, publicConfig },
    select: ESTIMATOR_SELECT,
  });
  return NextResponse.json({ ...estimatorSummary(row, check.compiled.spec), spec: check.compiled.spec }, { status: 201 });
}
