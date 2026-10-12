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

  // Converted is pinned last and never part of a reorder. A caller that lists
  // it anyway (an older page that read the full GET) isn't wrong about the
  // order of everything else, so it's dropped rather than refused.
  const all = await prisma.pipelineStage.findMany({
    where: { companyId },
    select: { id: true, isConverted: true },
  });
  const pinned = new Set(all.filter((s) => s.isConverted).map((s) => s.id));
  const known = new Set(all.filter((s) => !s.isConverted).map((s) => s.id));
  const ids = orderedIds.filter((id) => !pinned.has(id));
  const complete =
    ids.length === known.size &&
    ids.every((id) => known.has(id)) &&
    new Set(ids).size === ids.length;
  if (!complete) {
    // The list this tab holds no longer matches the board (a stage was added
    // or removed elsewhere) — the settings page re-pulls it on this error
    return NextResponse.json(
      {
        error:
          "The board's stages changed since this page loaded — the list has been refreshed, try the move again.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction(
    ids.map((id, i) => prisma.pipelineStage.update({ where: { id }, data: { sortOrder: i } }))
  );

  return NextResponse.json({ success: true });
}
