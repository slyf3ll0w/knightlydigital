import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";
import { findPlace } from "@/lib/places";
import { routeStopFields } from "@/lib/route-stop-input";

/**
 * POST — block off time on the schedule. Everyone may block their own
 * calendar; owners/admins may also block a teammate's calendar or the whole
 * company's (forUserId: null = everyone), or several specific people at once
 * (forUserIds: one block per person — a row is one calendar, so each stays
 * editable on its own; David 2026-10-27). Blocks render striped on the
 * schedule and subtract from online-booking availability.
 *
 * Route stops ride the same table (`kind`: ERRAND / BREAK, see
 * lib/route-stop-input.ts): a `placeId` fills the address from a saved
 * place, `flexible` + `floatAfterMin/BeforeMin` let the optimizer place it,
 * `beforeJobId` orders it ahead of a job.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const start = body.startAt ? new Date(body.startAt) : null;
  const end = body.endAt ? new Date(body.endAt) : null;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "A valid start and end time are required." }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 366 * 86400000) {
    return NextResponse.json({ error: "Blocks can span a year at most." }, { status: 400 });
  }
  const stopFields = await routeStopFields(body, actor);
  if ("error" in stopFields) return NextResponse.json({ error: stopFields.error }, { status: 400 });

  // Who the block applies to: self unless a manager says otherwise
  let userId: string | null = actor.id;
  // Several people at once: forUserIds wins over forUserId when both come
  let userIds: (string | null)[] | null = null;
  if (Array.isArray(body.forUserIds)) {
    if (!isManager(actor.role)) {
      return NextResponse.json({ error: "Only owners and admins can block off time for others." }, { status: 403 });
    }
    const ids = [...new Set((body.forUserIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0))].slice(0, 20);
    if (ids.length === 0) return NextResponse.json({ error: "Pick at least one team member." }, { status: 400 });
    const found = await prisma.user.findMany({
      where: { id: { in: ids }, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (found.length !== ids.length) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    userIds = ids;
  } else if ("forUserId" in body && body.forUserId !== actor.id) {
    if (!isManager(actor.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can block off time for others." },
        { status: 403 }
      );
    }
    if (body.forUserId === null) {
      userId = null; // company-wide
    } else if (typeof body.forUserId === "string") {
      const target = await prisma.user.findFirst({
        where: { id: body.forUserId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
      userId = target.id;
    } else {
      return NextResponse.json({ error: "Invalid team member." }, { status: 400 });
    }
  }

  // Optional location — a saved place's pin, else geocoded now so routing
  // can treat the block as a stop; an address that won't resolve is still
  // kept for the humans
  const place = stopFields.placeId ? await findPlace(actor.companyId, stopFields.placeId) : null;
  const address = typeof body.address === "string" && body.address.trim() ? body.address.trim().slice(0, 240) : place?.address ?? null;
  const pin = place && address === place.address ? { lat: place.lat, lng: place.lng } : address ? await geocodeAddress(address, actor.companyId) : null;

  const title = (typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : place?.name ?? (stopFields.kind === "BREAK" ? "Lunch" : stopFields.kind === "ERRAND" ? "Errand" : "Blocked off")
  ).slice(0, 120);
  const dataFor = (forId: string | null) => ({
    companyId: actor.companyId,
    userId: forId,
    createdById: actor.id,
    title,
    startAt: start,
    endAt: end,
    allDay: Boolean(body.allDay),
    address,
    lat: pin?.lat ?? null,
    lng: pin?.lng ?? null,
    ...stopFields,
  });

  if (userIds) {
    const blocks = await prisma.$transaction(userIds.map((forId) => prisma.timeBlock.create({ data: dataFor(forId) })));
    return NextResponse.json({ ...blocks[0], blocks, count: blocks.length }, { status: 201 });
  }
  const block = await prisma.timeBlock.create({ data: dataFor(userId) });

  return NextResponse.json(block, { status: 201 });
}
