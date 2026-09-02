import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { bookingTypeInclude, eligibleMembers, slotsForType } from "@/lib/booking-runtime";
import { groupSlotsByDay, localDayKey } from "@/lib/booking-engine";

/**
 * GET — what customers would see for this type over the next 7 days, plus
 * who could take each slot. The settings editor renders it live so an
 * owner can trust the drive-time rule before turning a type on.
 *   ?address=<customer address>  — judge drive time against a sample address
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [type, company] = await Promise.all([
    prisma.bookingType.findFirst({ where: { id, companyId: actor.companyId }, include: bookingTypeInclude }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { id: true, timezone: true, businessHours: true, arrivalWindowMinutes: true, bookingDriveLimitMinutes: true, lat: true, lng: true },
    }),
  ]);
  if (!type || !company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preview = { ...type, horizonDays: Math.min(type.horizonDays, 7) };
  const { slots, driveAware, members } = await slotsForType(preview, company, {
    address: req.nextUrl.searchParams.get("address")?.slice(0, 300),
    maxShownPerDay: null,
  });
  const names = new Map(type.members.map((m) => [m.userId, m.user.name]));
  const days = groupSlotsByDay(company.timezone, slots);
  const byStart = new Map(slots.map((s) => [s.start.toISOString(), s.memberIds]));
  const perDay = new Map<string, Set<string>>();
  for (const s of slots) {
    const key = localDayKey(company.timezone, s.start);
    if (!perDay.has(key)) perDay.set(key, new Set());
    for (const m of s.memberIds) perDay.get(key)!.add(m);
  }
  return NextResponse.json({
    driveAware,
    eligible: eligibleMembers(type).map((m) => ({ id: m.userId, name: m.user.name })),
    inactive: type.members.filter((m) => !m.user.isActive || !m.user.bookable).map((m) => ({ id: m.userId, name: m.user.name })),
    poolSize: members.length,
    days: days.map((d) => ({
      ...d,
      members: [...(perDay.get(d.date) ?? [])].map((id) => names.get(id) ?? "?"),
      slots: d.slots.map((s) => ({ ...s, members: (byStart.get(s.start) ?? []).map((id) => names.get(id) ?? "?") })),
    })),
  });
}
