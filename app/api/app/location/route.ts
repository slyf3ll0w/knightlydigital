import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { sanitizeGps } from "@/lib/time-entries";

/**
 * Team-map position reporting (see TeamLocationReporter.tsx).
 *
 * GET  — "am I on the clock?" The reporter checks this BEFORE touching the
 *        geolocation API, so location is never even read off the clock.
 * POST — store one position ping. Rejected (ignored:true) without an open
 *        time entry — the privacy rule is enforced server-side too.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const open = await prisma.timeEntry.findFirst({
    where: { userId: actor.id, endedAt: null },
    select: { id: true },
  });
  return NextResponse.json({ onClock: !!open });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const gps = sanitizeGps(body);
  if (!gps) return NextResponse.json({ error: "Invalid position." }, { status: 400 });

  const open = await prisma.timeEntry.findFirst({
    where: { userId: actor.id, endedAt: null },
    select: { id: true },
  });
  if (!open) return NextResponse.json({ ignored: true }); // clocked out — drop it

  await prisma.locationPing.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      timeEntryId: open.id,
      lat: gps.lat,
      lng: gps.lng,
      accuracy: gps.accuracy,
    },
  });
  return NextResponse.json({ success: true });
}
