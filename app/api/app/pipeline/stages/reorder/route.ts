import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST — reorder the board's columns.
 * Body: { orderedIds: string[] } — must name every stage exactly once.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const orderedIds: string[] = Array.isArray(body.orderedIds)
    ? body.orderedIds.filter((v: unknown): v is string => typeof v === "string")
    : [];

  // Converted is pinned last and never part of a reorder
  const stages = await prisma.pipelineStage.findMany({
    where: { companyId, isConverted: false },
    select: { id: true },
  });
  const known = new Set(stages.map((s) => s.id));
  const complete =
    orderedIds.length === stages.length && orderedIds.every((id) => known.has(id)) &&
    new Set(orderedIds).size === orderedIds.length;
  if (!complete) {
    return NextResponse.json(
      { error: "orderedIds must include every stage exactly once." },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.pipelineStage.update({ where: { id }, data: { sortOrder: i } })
    )
  );

  return NextResponse.json({ success: true });
}
