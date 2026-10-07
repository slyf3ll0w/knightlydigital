import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSell, getActor } from "@/lib/permissions";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { findDriveConflicts } from "@/lib/schedule-drive";

/**
 * POST /api/app/schedule/check — the live "heads up" under a form's time
 * fields while someone picks a time (David 2026-10-06), before anything is
 * saved: who else is booked then (lib/schedule-conflicts.ts) and, for
 * on-site work, who can't drive there in time or on to their next stop
 * (lib/schedule-drive.ts). Never blocks; the forms save regardless.
 *
 * Body: { start, end, userIds, onSite?, address?, propertyId?, contactId?,
 *         excludeJobId?, excludeAppointmentId? }
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The labels name other people's jobs, appointments and blocks — which
  // jobScope hides from techs. Only the scheduling side (owners, admins,
  // dispatchers, sales — canSell covers managers) may ask; the forms that
  // call this are theirs, and ScheduleJob skips the hook for anyone else.
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  const start = new Date(body.start);
  const end = new Date(body.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ conflicts: [], drive: [] });
  }
  const asked: string[] = Array.isArray(body.userIds)
    ? body.userIds.filter((v: unknown): v is string => typeof v === "string" && v.length > 0).slice(0, 10)
    : [];
  // Only people of this company — the labels name them
  const userIds = asked.length
    ? (await prisma.user.findMany({ where: { id: { in: asked }, companyId: actor.companyId }, select: { id: true } })).map((u) => u.id)
    : [];
  if (userIds.length === 0) return NextResponse.json({ conflicts: [], drive: [] });

  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const common = {
    companyId: actor.companyId,
    start,
    end,
    userIds,
    excludeJobId: str(body.excludeJobId),
    excludeAppointmentId: str(body.excludeAppointmentId),
  };
  const [conflicts, drive] = await Promise.all([
    findScheduleConflicts(common).catch(() => [] as string[]),
    body.onSite
      ? findDriveConflicts({
          ...common,
          address: str(body.address)?.slice(0, 300) ?? null,
          propertyId: str(body.propertyId) ?? null,
          contactId: str(body.contactId) ?? null,
        }).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);
  return NextResponse.json({ conflicts, drive });
}
