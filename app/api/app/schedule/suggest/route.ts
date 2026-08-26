import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { parseRouteDate } from "@/lib/route-plan";
import { suggestTimes } from "@/lib/find-a-time";

/**
 * POST /api/app/schedule/suggest — "Find a Time": drive-time-aware start-time
 * suggestions for one tech's day (lib/find-a-time.ts).
 *
 * Body: {
 *   date: "YYYY-MM-DD",
 *   userId: string,            // whose day to fit into
 *   address?: string,          // where the new visit is
 *   durationMinutes?: number,  // visit length (default 60)
 *   excludeId?: string         // job/appointment being rescheduled
 * }
 *
 * Managers + USER may ask about anyone; TECH/SALES only about themselves.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" && body.userId ? body.userId : actor.id;

  const dispatcher = isManager(actor.role) || actor.role === "USER";
  if (!dispatcher && userId !== actor.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: actor.companyId, isActive: true },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  // "Today" resolves in the company's timezone, not the server's
  const tz = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const result = await suggestTimes(actor, {
    date: parseRouteDate(typeof body.date === "string" ? body.date : null, tz?.timezone),
    userId,
    durationMinutes: Number(body.durationMinutes) || undefined,
    address: typeof body.address === "string" ? body.address : null,
    excludeId: typeof body.excludeId === "string" ? body.excludeId : null,
  });
  return NextResponse.json(result);
}
