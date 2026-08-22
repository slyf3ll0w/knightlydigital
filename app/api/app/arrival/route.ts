import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";

/**
 * Arrival awareness (components/ArrivalNudge.tsx): "what's my next stop, and
 * am I clocked into it?" — the client compares the returned coordinates to a
 * one-shot device fix and offers a "Clock in?" prompt when they match.
 *
 * Coordinates resolve through the global GeocodeCache (lib/geocoding.ts), so
 * an address is paid for at most once platform-wide; with no MAPBOX_TOKEN or
 * an unresolvable address the job simply comes back without a pin and the
 * client stays quiet. Never returns someone else's visit: the job must be
 * assigned to me, or be unassigned (the solo-owner convention).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sales don't clock time on jobs — nothing to prompt
  if (actor.role === "SALES") return NextResponse.json({ job: null, clockedInJobId: null });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const [openEntry, job] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { jobId: true },
    }),
    prisma.job.findFirst({
      where: {
        companyId: actor.companyId,
        ...jobScope(actor),
        status: "ACTIVE",
        scheduledAt: { gte: startOfDay, lt: endOfDay },
        OR: [
          { assignments: { some: { userId: actor.id } } },
          { assignments: { none: {} } },
        ],
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        address: true,
        contact: { select: { address: true } },
      },
    }),
  ]);

  if (!job) return NextResponse.json({ job: null, clockedInJobId: openEntry?.jobId ?? null });

  const address = job.address ?? job.contact.address;
  const pin = address ? await geocodeAddress(address, actor.companyId) : null;

  return NextResponse.json({
    job: { id: job.id, title: job.title, lat: pin?.lat ?? null, lng: pin?.lng ?? null },
    clockedInJobId: openEntry?.jobId ?? null,
  });
}
