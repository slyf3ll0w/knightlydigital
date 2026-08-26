import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { parseRouteDate, resolveDriveLegs, resolveRouteDay } from "@/lib/route-plan";

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
  const unscheduled = unscheduledRows.map((j) => ({
    id: j.id,
    jobNumber: j.jobNumber,
    title: j.title,
    contactName: `${j.contact.firstName} ${j.contact.lastName}`.trim(),
    address: j.address ?? j.contact.address ?? null,
    assigneeIds: j.assignments.map((a) => a.userId),
  }));
  return NextResponse.json({ ...day, drive, unscheduled });
}
