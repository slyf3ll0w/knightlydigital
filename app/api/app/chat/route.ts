import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * Team chat: one company-wide channel. GET returns new messages (for the
 * page's poll loop) and stamps chatLastSeenAt — the chat page is the only
 * caller, so fetching IS seeing. POST sends a message.
 */

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { name: true } },
} as const;

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  const messages = afterDate && !isNaN(afterDate.getTime())
    ? await prisma.teamMessage.findMany({
        where: { companyId: actor.companyId, createdAt: { gt: afterDate } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: MESSAGE_SELECT,
      })
    : (
        await prisma.teamMessage.findMany({
          where: { companyId: actor.companyId },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: MESSAGE_SELECT,
        })
      ).reverse();

  await prisma.user.update({
    where: { id: actor.id },
    data: { chatLastSeenAt: new Date() },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      userId: m.userId,
      userName: m.user.name,
    })),
  });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ error: "Message is too long (4000 characters max)." }, { status: 400 });
  }

  const message = await prisma.teamMessage.create({
    data: { companyId: actor.companyId, userId: actor.id, body: text },
    select: MESSAGE_SELECT,
  });

  // Sending also means you're caught up
  await prisma.user.update({
    where: { id: actor.id },
    data: { chatLastSeenAt: new Date() },
  });

  return NextResponse.json(
    {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      userId: message.userId,
      userName: message.user.name,
    },
    { status: 201 }
  );
}
