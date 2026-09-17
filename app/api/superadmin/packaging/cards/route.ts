import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { backlogLane } from "@/lib/packaging-board";

/**
 * Add a feature card by hand — something not in the catalog yet, or a
 * packaging-only line ("Priority onboarding call"). Lands in Unassigned
 * unless a lane is named. Hand-typed cards carry no catalogKey, so a later
 * catalog sync never touches them.
 */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (!title) return NextResponse.json({ error: "Give the feature a name." }, { status: 400 });

  let laneId = typeof body.laneId === "string" ? body.laneId : "";
  if (laneId) {
    const lane = await prisma.packagingLane.findUnique({ where: { id: laneId } });
    if (!lane) laneId = "";
  }
  if (!laneId) laneId = (await backlogLane()).id;

  const top = await prisma.packagingCard.aggregate({ where: { laneId }, _max: { sort: true } });

  const card = await prisma.packagingCard.create({
    data: {
      laneId,
      title,
      body: typeof body.body === "string" ? body.body.trim().slice(0, 400) || null : null,
      group: typeof body.group === "string" ? body.group.trim().slice(0, 40) || null : null,
      icon: typeof body.icon === "string" ? body.icon.trim().slice(0, 40) || null : null,
      sort: (top._max.sort ?? -1) + 1,
    },
  });

  return NextResponse.json({ success: true, id: card.id });
}
