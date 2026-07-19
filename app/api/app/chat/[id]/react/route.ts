import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { TAPBACKS } from "@/lib/chat";

/** Toggle a tapback reaction on a message in any channel you belong to. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = limit(`chat-react:${actor.id}`, 60, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many reactions — slow down." }, { status: 429 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!(TAPBACKS as readonly string[]).includes(emoji)) {
    return NextResponse.json({ error: "Unknown reaction." }, { status: 400 });
  }

  // Must be a message in the Everyone channel or one whose channel the actor
  // is a member of
  const message = await prisma.teamMessage.findFirst({
    where: {
      id,
      companyId: actor.companyId,
      deletedAt: null,
      channel: {
        OR: [{ isEveryone: true }, { members: { some: { userId: actor.id } } }],
      },
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
