import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, type Actor } from "@/lib/permissions";

/**
 * PATCH / DELETE a time block. Managers may touch any block in the company
 * (including company-wide ones); everyone else only their own personal blocks.
 */

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

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    data.title = (String(body.title).trim() || "Blocked off").slice(0, 120);
  }
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
  if (body.allDay !== undefined) data.allDay = Boolean(body.allDay);

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

  const updated = await prisma.timeBlock.update({ where: { id: block.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const block = await findEditable(actor, id);
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.timeBlock.delete({ where: { id: block.id } });
  return NextResponse.json({ ok: true });
}
