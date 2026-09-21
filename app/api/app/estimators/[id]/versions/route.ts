import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { listEstimatorVersions } from "@/lib/estimator-server";

/** GET — the tool's saved versions, newest first, each with what the edit after it changed. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.estimator.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, name: true, spec: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ versions: await listEstimatorVersions(row) });
}
