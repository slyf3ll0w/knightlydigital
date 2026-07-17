import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * Team map data (owners/admins): everyone currently clocked in, with their
 * freshest known position — the latest ping from this clock-in session, or
 * the clock-in GPS stamp as a fallback. Techs with no position at all still
 * appear (listed without a marker) so the map never hides who's working.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const open = await prisma.timeEntry.findMany({
    where: { companyId: actor.companyId, endedAt: null },
    include: {
      user: { select: { id: true, name: true } },
      job: { select: { id: true, title: true, address: true } },
      locationPings: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
    orderBy: { startedAt: "asc" },
  });

  const team = open.map((e) => {
    const ping = e.locationPings[0] ?? null;
    const hasStamp = e.startLat != null && e.startLng != null;
    return {
      userId: e.user.id,
      name: e.user.name,
      jobId: e.job?.id ?? null,
      jobTitle: e.job?.title ?? null,
      jobAddress: e.job?.address ?? null,
      startedAt: e.startedAt.toISOString(),
      lat: ping?.lat ?? (hasStamp ? e.startLat : null),
      lng: ping?.lng ?? (hasStamp ? e.startLng : null),
      accuracy: ping?.accuracy ?? (hasStamp ? e.startAccuracy : null),
      positionAt: ping
        ? ping.recordedAt.toISOString()
        : hasStamp
          ? e.startedAt.toISOString()
          : null,
    };
  });

  return NextResponse.json({ team, at: new Date().toISOString() });
}
