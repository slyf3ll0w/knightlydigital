import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { parseRouteDate, resolveDriveLegs, resolveRouteDay } from "@/lib/route-plan";

/**
 * GET /api/app/route-plan?date=YYYY-MM-DD — one day of field work as
 * mappable stops (jobs + in-person appointments), coordinates resolved
 * through lib/route-plan.ts, plus per-tech drive legs between consecutive
 * stops. Role scoping matches the schedule: techs get their assigned jobs
 * only, sales their leads', managers/USER everything. Tech filtering happens
 * client-side — the whole day is one payload.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = parseRouteDate(req.nextUrl.searchParams.get("date"));
  const day = await resolveRouteDay(actor, date);
  const drive = await resolveDriveLegs(day, actor.companyId);
  return NextResponse.json({ ...day, drive });
}
