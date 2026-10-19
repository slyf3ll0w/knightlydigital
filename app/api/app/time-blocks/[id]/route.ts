import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, type Actor } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";
import { findPlace } from "@/lib/places";
import { routeStopFields } from "@/lib/route-stop-input";
import { companyTimezone, detachOccurrence, removeOccurrence } from "@/lib/time-block-series";

/**
 * PATCH / DELETE a time block. Managers may touch any block in the company
 * (including company-wide ones); everyone else only their own personal blocks.
 * Blocks mirrored from Google Calendar (source GOOGLE) are read-only here —
 * the pull would just rewrite them — so both verbs answer 409 for those.
 *
 * One occurrence of a repeating block is "just this day": editing it
 * detaches it from the series (it stops repeating on its own and keeps the
 * change), removing it skips that day. The series itself is changed through
 * /api/app/time-block-series/[id].
 */

const MIRRORED = "This comes from Google Calendar — change it there and it updates here within a few minutes.";

async function findEditable(actor: Actor, id: string) {
  return prisma.timeBlock.findFirst({
    where: {
      id,
      companyId: actor.companyId,
      ...(isManager(actor.role) ? {} : { userId: actor.id }),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const block = await findEditable(actor, id);
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (block.source === "GOOGLE") return NextResponse.json({ error: MIRRORED }, { status: 409 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    data.title = (String(body.title).trim() || "Blocked off").slice(0, 120);
  }
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
  if (body.allDay !== undefined) data.allDay = Boolean(body.allDay);
  if (body.address !== undefined) {
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 240) || null : null;
    data.address = address;
    if (address !== block.address) {
      const pin = address ? await geocodeAddress(address, actor.companyId) : null;
      data.lat = pin?.lat ?? null;
      data.lng = pin?.lng ?? null;
    }
  }
  // Route-stop fields (kind, place, float window, before-job, done)
  const stopFields = await routeStopFields(body, actor, block);
  if ("error" in stopFields) return NextResponse.json({ error: stopFields.error }, { status: 400 });
  Object.assign(data, stopFields);
  if (stopFields.placeId && stopFields.placeId !== block.placeId && body.address === undefined) {
    // Picking a different saved place moves the stop there
    const place = await findPlace(actor.companyId, stopFields.placeId);
    if (place) {
      data.address = place.address;
      data.lat = place.lat;
      data.lng = place.lng;
    }
  }
  if (typeof body.done === "boolean") data.doneAt = body.done ? new Date() : null;

  const start = (data.startAt ?? block.startAt) as Date;
  const end = (data.endAt ?? block.endAt) as Date;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "A valid start and end time are required." }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 366 * 86400000) {
    return NextResponse.json({ error: "Blocks can span a year at most." }, { status: 400 });
  }

  // Re-targeting who the block applies to is a manager-only move
  if (body.forUserId !== undefined && body.forUserId !== block.userId) {
    if (!isManager(actor.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can block off time for others." },
        { status: 403 }
      );
    }
    if (body.forUserId === null) {
      data.userId = null;
    } else if (typeof body.forUserId === "string") {
      const target = await prisma.user.findFirst({
        where: { id: body.forUserId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
      data.userId = target.id;
    } else {
      return NextResponse.json({ error: "Invalid team member." }, { status: 400 });
    }
  }

  // "Just this day": the day leaves its series before the change lands
  if (block.seriesId) await detachOccurrence(block, await companyTimezone(actor.companyId));

  const updated = await prisma.timeBlock.update({ where: { id: block.id }, data });
  return NextResponse.json({ ...updated, detached: Boolean(block.seriesId) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const block = await findEditable(actor, id);
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (block.source === "GOOGLE") return NextResponse.json({ error: MIRRORED }, { status: 409 });

  if (block.seriesId) {
    await removeOccurrence(block, await companyTimezone(actor.companyId));
  } else {
    await prisma.timeBlock.delete({ where: { id: block.id } });
  }
  return NextResponse.json({ ok: true });
}
