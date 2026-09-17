import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { backlogLane } from "@/lib/packaging-board";

/**
 * Rename a column, reprice it, restyle it, or shuffle it left/right.
 * `direction` swaps sort with the neighbour on that side.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lane = await prisma.packagingLane.findUnique({ where: { id } });
  if (!lane) return NextResponse.json({ error: "Column not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // ── reorder: swap with the neighbour ──
  if (body.direction === "left" || body.direction === "right") {
    if (lane.kind === "BACKLOG") {
      return NextResponse.json({ error: "Unassigned stays first." }, { status: 400 });
    }
    const neighbour = await prisma.packagingLane.findFirst({
      where: {
        kind: { not: "BACKLOG" },
        sort: body.direction === "left" ? { lt: lane.sort } : { gt: lane.sort },
      },
      orderBy: { sort: body.direction === "left" ? "desc" : "asc" },
    });
    if (!neighbour) return NextResponse.json({ success: true });
    await prisma.$transaction([
      prisma.packagingLane.update({ where: { id: lane.id }, data: { sort: neighbour.sort } }),
      prisma.packagingLane.update({ where: { id: neighbour.id }, data: { sort: lane.sort } }),
    ]);
    return NextResponse.json({ success: true });
  }

  // ── edit ──
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (typeof body.price === "string") data.price = body.price.trim().slice(0, 40) || null;
  if (typeof body.priceNote === "string")
    data.priceNote = body.priceNote.trim().slice(0, 80) || null;
  if (typeof body.blurb === "string") data.blurb = body.blurb.trim().slice(0, 200) || null;
  if (typeof body.accent === "string")
    data.accent = /^#[0-9a-f]{6}$/i.test(body.accent) ? body.accent : null;
  if ((body.kind === "TIER" || body.kind === "ADDON") && lane.kind !== "BACKLOG")
    data.kind = body.kind;

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true });
  await prisma.packagingLane.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

/** Delete a column. Its cards fall back to Unassigned rather than vanishing. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lane = await prisma.packagingLane.findUnique({ where: { id } });
  if (!lane) return NextResponse.json({ success: true });
  if (lane.kind === "BACKLOG") {
    return NextResponse.json({ error: "Unassigned can't be deleted." }, { status: 400 });
  }

  const backlog = await backlogLane();
  const top = await prisma.packagingCard.aggregate({
    where: { laneId: backlog.id },
    _max: { sort: true },
  });
  const cards = await prisma.packagingCard.findMany({
    where: { laneId: id },
    orderBy: { sort: "asc" },
    select: { id: true },
  });
  let sort = (top._max.sort ?? -1) + 1;

  await prisma.$transaction([
    ...cards.map((c) =>
      prisma.packagingCard.update({
        where: { id: c.id },
        data: { laneId: backlog.id, sort: sort++ },
      })
    ),
    prisma.packagingLane.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true, returned: cards.length });
}
