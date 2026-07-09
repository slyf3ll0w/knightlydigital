import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { TAPBACKS, threadWhere } from "@/lib/chat";

/** Toggle a tapback reaction on a message in any thread you can see. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!(TAPBACKS as readonly string[]).includes(emoji)) {
    return NextResponse.json({ error: "Unknown reaction." }, { status: 400 });
  }

  // Must be a message in the company channel or a DM the actor is part of
  const message = await prisma.teamMessage.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [
        threadWhere(actor, null),
        { companyId: actor.companyId, userId: actor.id, recipientId: { not: null } },
        { companyId: actor.companyId, recipientId: actor.id },
      ],
    },
    select: { id: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const existing = await prisma.teamMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: id, userId: actor.id, emoji } },
    select: { id: true },
  });
  if (existing) {
    await prisma.teamMessageReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ reacted: false });
  }
  await prisma.teamMessageReaction.create({
    data: { messageId: id, userId: actor.id, emoji },
  });
  return NextResponse.json({ reacted: true });
}
