import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { bookingTypeInclude } from "@/lib/booking-runtime";
import { BOOKING_KINDS, defaultSettingsForKind, slugifyTypeName, type BookingKind } from "@/lib/booking-types";

const MAX_TYPES = 20;

/** GET — every booking type of the company (settings list). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const types = await prisma.bookingType.findMany({
    where: { companyId: actor.companyId },
    include: bookingTypeInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(types);
}

/**
 * POST — create a booking type: { name, kind }. Starts with sensible
 * kind defaults and every currently bookable member in the pool, so the
 * owner lands in the editor with something that already works.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const kind: BookingKind = BOOKING_KINDS.includes(body.kind) ? body.kind : "PHONE_CALL";
  const settings = defaultSettingsForKind(kind, typeof body.name === "string" ? body.name.slice(0, 80) : undefined);

  const count = await prisma.bookingType.count({ where: { companyId: actor.companyId } });
  if (count >= MAX_TYPES) {
    return NextResponse.json({ error: `Limit of ${MAX_TYPES} booking types reached.` }, { status: 400 });
  }

  const base = slugifyTypeName(settings.name);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const clash = await prisma.bookingType.findFirst({ where: { companyId: actor.companyId, slug }, select: { id: true } });
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const bookable = await prisma.user.findMany({
    where: { companyId: actor.companyId, isActive: true, bookable: true },
    select: { id: true },
  });

  const type = await prisma.bookingType.create({
    data: {
      companyId: actor.companyId,
      slug,
      sortOrder: count,
      ...settings,
      members: { create: bookable.map((u) => ({ userId: u.id })) },
    },
    include: bookingTypeInclude,
  });
  return NextResponse.json(type, { status: 201 });
}
