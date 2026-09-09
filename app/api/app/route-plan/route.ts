import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { dayStartFor, parseRouteDate, resolveDriveLegs, resolveRouteDay } from "@/lib/route-plan";
import { directionsEnabled, routeGeometry } from "@/lib/directions";

/**
 * GET /api/app/route-plan?date=YYYY-MM-DD — one day of field work as
 * mappable stops (jobs + in-person appointments), coordinates resolved
 * through lib/route-plan.ts, plus per-tech drive legs between consecutive
 * stops, plus the unscheduled backlog so a dispatcher can BUILD the day here
 * (day-first: pull a job onto the day, then Optimize slots it). Role scoping
 * matches the schedule: techs get their assigned jobs only, sales their
 * leads', managers/USER everything. Tech filtering happens client-side —
 * the whole day is one payload.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // "Today" resolves in the company's timezone, not the server's
  const tz = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const date = parseRouteDate(req.nextUrl.searchParams.get("date"), tz?.timezone);
  const [day, unscheduledRows] = await Promise.all([
    resolveRouteDay(actor, date),
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        ...jobScope(actor),
        status: "ACTIVE",
        scheduledAt: null,
      },
      select: {
        id: true,
        jobNumber: true,
        title: true,
        address: true,
        contact: { select: { firstName: true, lastName: true, address: true } },
        assignments: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const drive = await resolveDriveLegs(day, actor.companyId);

  // Road geometry per tech (opt-in: the map page asks, the calendar's
  // drive-gap fetch doesn't pay for lines it never draws)
  let geometry: Record<string, [number, number][]> | undefined;
  if (req.nextUrl.searchParams.get("geometry") === "1" && directionsEnabled()) {
    geometry = {};
    const userIds = [...new Set(day.stops.flatMap((s) => s.assigneeIds))];
    await Promise.all(
      userIds.map(async (userId) => {
        const start = dayStartFor(day, userId);
        const route = day.stops
          .filter((s) => s.assigneeIds.includes(userId) && s.lat != null && s.lng != null)
          .sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime());
        const points = [
          ...(start ? [{ lat: start.lat, lng: start.lng }] : []),
          ...route.map((s) => ({ lat: s.lat!, lng: s.lng! })),
        ];
        if (points.length < 2) return;
        const g = await routeGeometry(points, actor.companyId);
        if (g) geometry![userId] = g.coords;
      })
    );
  }

  const unscheduled = unscheduledRows.map((j) => ({
    id: j.id,
    jobNumber: j.jobNumber,
    title: j.title,
    contactName: `${j.contact.firstName} ${j.contact.lastName}`.trim(),
    address: j.address ?? j.contact.address ?? null,
    assigneeIds: j.assignments.map((a) => a.userId),
  }));
  return NextResponse.json({ ...day, drive, unscheduled, geometry });
}
