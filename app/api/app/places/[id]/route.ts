import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { parsePlaceInput, placePin, placeSelect, serializePlace } from "@/lib/places";

/**
 * PATCH — edit a place (anyone; a changed address is geocoded again) or
 * archive / restore it (`archived: true|false`, managers). DELETE archives
 * too: stops that were made from the place keep their copied address, so
 * nothing on a route goes blank.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.place.findFirst({ where: { id, companyId: actor.companyId }, select: placeSelect });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parsePlaceInput(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const data: Record<string, unknown> = { ...parsed };
  if (parsed.address !== undefined && parsed.address !== existing.address) {
    const pin = await placePin(parsed.address, actor.companyId);
    data.lat = pin.lat;
    data.lng = pin.lng;
    data.geocodedAt = new Date();
  }
  if (typeof body.archived === "boolean") {
    if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can archive places." }, { status: 403 });
    data.archivedAt = body.archived ? new Date() : null;
  }
  const place = await prisma.place.update({ where: { id }, data, select: placeSelect });
  return NextResponse.json({ place: serializePlace(place) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can archive places." }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.place.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.place.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
