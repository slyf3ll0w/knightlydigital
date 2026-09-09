import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";

/**
 * POST — block off time on the schedule. Everyone may block their own
 * calendar; owners/admins may also block a teammate's calendar or the whole
 * company's (forUserId: null = everyone). Blocks render striped on the
 * schedule and subtract from online-booking availability.
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

  // Who the block applies to: self unless a manager says otherwise
  let userId: string | null = actor.id;
  if ("forUserId" in body && body.forUserId !== actor.id) {
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

  // Optional location — geocoded now so routing can treat the block as a
  // stop; an address that won't resolve is still kept for the humans
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 240) || null : null;
  const pin = address ? await geocodeAddress(address, actor.companyId) : null;

  const block = await prisma.timeBlock.create({
    data: {
      companyId: actor.companyId,
      userId,
      createdById: actor.id,
      title: (typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Blocked off"
      ).slice(0, 120),
      startAt: start,
      endAt: end,
      allDay: Boolean(body.allDay),
      address,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
    },
  });

  return NextResponse.json(block, { status: 201 });
}
