import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { bookingTypeInclude } from "@/lib/booking-runtime";
import {
  applyBookingTypePatch,
  sanitizeMembers,
  sanitizeServiceIds,
  slugifyTypeName,
  type BookingTypeSettings,
} from "@/lib/booking-types";

async function load(id: string, companyId: string) {
  return prisma.bookingType.findFirst({ where: { id, companyId }, include: bookingTypeInclude });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const type = await load(id, actor.companyId);
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(type);
}

/**
 * PATCH — edit settings, the pool ({ members: [{userId, priority}] }),
 * the services ({ services: [workItemId] }), or the slug. Payment can only
 * be turned on for SERVICE types whose services are all fixed-price — a
 * "From $150" item can't be charged a number the customer never agreed to.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const type = await load(id, actor.companyId);
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const current: BookingTypeSettings = {
    name: type.name,
    description: type.description,
    kind: type.kind,
    isActive: type.isActive,
    durationMinutes: type.durationMinutes,
    stepMinutes: type.stepMinutes,
    bufferBeforeMinutes: type.bufferBeforeMinutes,
    bufferAfterMinutes: type.bufferAfterMinutes,
    leadHours: type.leadHours,
    horizonDays: type.horizonDays,
    maxPerDay: type.maxPerDay,
    maxShownPerDay: type.maxShownPerDay,
    confirmation: type.confirmation,
    arrivalWindowMinutes: type.arrivalWindowMinutes,
    meetingLink: type.meetingLink,
    paymentMode: type.paymentMode,
    assignment: type.assignment,
    clientCanReschedule: type.clientCanReschedule,
    clientCanCancel: type.clientCanCancel,
    cutoffHours: type.cutoffHours,
  };
  const { settings, error } = applyBookingTypePatch(current, body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  // Services (SERVICE kinds): must be this company's active price-book items
  const serviceIds = type.kind === "SERVICE" ? sanitizeServiceIds(body.services) : null;
  let serviceRows: { workItemId: string; sortOrder: number }[] | null = null;
  if (serviceIds) {
    const items = await prisma.workItem.findMany({
      where: { id: { in: serviceIds }, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    const ok = new Set(items.map((i) => i.id));
    serviceRows = serviceIds.filter((sid) => ok.has(sid)).map((workItemId, i) => ({ workItemId, sortOrder: i }));
  }

  // Payment needs every offered service to be fixed-price
  if (settings.paymentMode !== "NONE") {
    const ids = serviceRows ? serviceRows.map((r) => r.workItemId) : type.services.map((s) => s.workItemId);
    if (ids.length === 0) {
      return NextResponse.json({ error: "Add at least one service before turning on payment." }, { status: 400 });
    }
    const nonFixed = await prisma.workItem.count({
      where: { id: { in: ids }, priceDisplay: { not: "FIXED" } },
    });
    if (nonFixed > 0) {
      return NextResponse.json(
        { error: "Payment at booking needs fixed-price services only — remove any \"starting at\", hourly or quote-only items first." },
        { status: 400 }
      );
    }
  }

  // Pool: members of this company; inactive users are dropped silently
  const members = sanitizeMembers(body.members);
  let memberRows: { userId: string; priority: number; lastAssignedAt: Date | null }[] | null = null;
  if (members) {
    const users = await prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) }, companyId: actor.companyId },
      select: { id: true },
    });
    const ok = new Set(users.map((u) => u.id));
    const existing = new Map(type.members.map((m) => [m.userId, m.lastAssignedAt]));
    memberRows = members
      .filter((m) => ok.has(m.userId))
      .map((m) => ({ userId: m.userId, priority: m.priority, lastAssignedAt: existing.get(m.userId) ?? null }));
  }

  // Slug rename (unique per company)
  let slug: string | undefined;
  if (typeof body.slug === "string" && body.slug.trim()) {
    slug = slugifyTypeName(body.slug);
    if (slug !== type.slug) {
      const clash = await prisma.bookingType.findFirst({
        where: { companyId: actor.companyId, slug, id: { not: type.id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: "That link is already used by another booking type." }, { status: 400 });
    }
  }

  const sortOrder =
    Number.isInteger(Number(body.sortOrder)) && Number(body.sortOrder) >= 0 ? Number(body.sortOrder) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (memberRows) {
      await tx.bookingTypeMember.deleteMany({ where: { bookingTypeId: type.id } });
      if (memberRows.length) {
        await tx.bookingTypeMember.createMany({ data: memberRows.map((m) => ({ bookingTypeId: type.id, ...m })) });
      }
    }
    if (serviceRows) {
      await tx.bookingTypeService.deleteMany({ where: { bookingTypeId: type.id } });
      if (serviceRows.length) {
        await tx.bookingTypeService.createMany({ data: serviceRows.map((s) => ({ bookingTypeId: type.id, ...s })) });
      }
    }
    return tx.bookingType.update({
      where: { id: type.id },
      data: { ...settings, ...(slug ? { slug } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}) },
      include: bookingTypeInclude,
    });
  });
  return NextResponse.json(updated);
}

/**
 * DELETE — remove a booking type. Bookings it produced (appointments, jobs,
 * requests) stay; their bookingTypeId nulls out.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const type = await prisma.bookingType.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.bookingType.delete({ where: { id: type.id } });
  return NextResponse.json({ success: true });
}
