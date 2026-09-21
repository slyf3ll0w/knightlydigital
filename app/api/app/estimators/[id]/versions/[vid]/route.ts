import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary, snapshotEstimator } from "@/lib/estimator-server";

/**
 * POST — restore this saved version's rules. The live rules are snapshotted
 * first ("Before restoring …"), so a restore is itself undoable. The version
 * must still compile against today's price book (an item it sold may have
 * been deleted since) — otherwise 400 with the reasons.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; vid: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, vid } = await params;
  const row = await prisma.estimator.findFirst({ where: { id, companyId: actor.companyId }, select: ESTIMATOR_SELECT });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const version = await prisma.estimatorVersion.findFirst({ where: { id: vid, estimatorId: row.id }, select: { id: true, spec: true, description: true, createdAt: true } });
  if (!version) return NextResponse.json({ error: "That version is gone." }, { status: 404 });

  const check = await checkSpec(actor.companyId, version.spec);
  if (!check.ok) return NextResponse.json({ error: `That version can't run today: ${check.errors[0]}`, errors: check.errors }, { status: 400 });

  const when = version.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  await snapshotEstimator(row, `Before restoring the ${when} version`, { id: actor.id, name: actor.name });
  const updated = await prisma.estimator.update({
    where: { id: row.id },
    data: { spec: check.compiled.spec, description: version.description },
    select: ESTIMATOR_SELECT,
  });
  const spec = specFromJson(updated.spec);
  return NextResponse.json(spec ? { ...estimatorSummary(updated, spec), spec } : { id: updated.id, name: updated.name, broken: true });
}
