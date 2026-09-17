import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/**
 * Commit a drag. The client sends the FULL card order of every lane the drag
 * touched — the source lane and the destination lane, or just the one lane on
 * a same-column reorder — and this rewrites laneId + sort for each listed id.
 * Sending whole lanes (rather than one card's new index) means the board can
 * never drift out of order, whatever the drag did.
 *
 *   { lanes: [{ laneId, cardIds: [...] }, ...] }
 */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lanes: { laneId: string; cardIds: string[] }[] = Array.isArray(body.lanes)
    ? body.lanes
    : [];
  if (lanes.length === 0) return NextResponse.json({ success: true });

  const laneIds = lanes.map((l) => l.laneId).filter((x) => typeof x === "string");
  const known = await prisma.packagingLane.findMany({
    where: { id: { in: laneIds } },
    select: { id: true },
  });
  const valid = new Set(known.map((l) => l.id));

  const updates = lanes.flatMap((lane) =>
    valid.has(lane.laneId) && Array.isArray(lane.cardIds)
      ? lane.cardIds
          .filter((cardId): cardId is string => typeof cardId === "string")
          .map((cardId, i) =>
            prisma.packagingCard.updateMany({
              where: { id: cardId },
              data: { laneId: lane.laneId, sort: i },
            })
          )
      : []
  );

  if (updates.length > 0) await prisma.$transaction(updates);
  return NextResponse.json({ success: true });
}
