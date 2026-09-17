import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/**
 * Reword a card, or move it to another column without dragging (the dialog's
 * "Sold in" picker — the only way to move a card on a phone). Editing a
 * catalog card keeps its key: the wording here is the pricing-page wording,
 * which is allowed to differ from /features.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const card = await prisma.packagingCard.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim())
    data.title = body.title.trim().slice(0, 80);
  if (typeof body.body === "string") data.body = body.body.trim().slice(0, 400) || null;
  if (typeof body.group === "string") data.group = body.group.trim().slice(0, 40) || null;

  // A lane move lands the card at the bottom of its new column.
  if (typeof body.laneId === "string" && body.laneId && body.laneId !== card.laneId) {
    const lane = await prisma.packagingLane.findUnique({ where: { id: body.laneId } });
    if (!lane) return NextResponse.json({ error: "Column not found." }, { status: 404 });
    const top = await prisma.packagingCard.aggregate({
      where: { laneId: lane.id },
      _max: { sort: true },
    });
    data.laneId = lane.id;
    data.sort = (top._max.sort ?? -1) + 1;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true });
  await prisma.packagingCard.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

/** Remove a card from the board. A catalog feature comes back on the next
 *  sync — which is the point: deleting is "not part of the offer", not
 *  "this feature doesn't exist." Use Unassigned for undecided. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.packagingCard.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
