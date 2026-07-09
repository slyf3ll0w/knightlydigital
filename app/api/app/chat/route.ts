import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import {
  resolveThread,
  threadWhere,
  markThreadSeen,
  unreadByThread,
  activeTypers,
  MESSAGE_SELECT,
  serializeMessage,
} from "@/lib/chat";

/**
 * Team chat. GET returns a full snapshot of the requested thread (last 100
 * messages with reactions), the roster with per-thread unread counts, and
 * who's typing — the page polls this every few seconds, so edits, deletes,
 * and reactions propagate without any extra bookkeeping. Fetching a thread
 * marks it read. POST sends a message to a thread.
 */

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveThread(actor, req.nextUrl.searchParams.get("thread"));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 });
  const { peerId } = resolved;

  const [messages, team] = await Promise.all([
    prisma.teamMessage.findMany({
      where: threadWhere(actor, peerId),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: MESSAGE_SELECT,
    }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, role: true, phone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  await markThreadSeen(actor.id, peerId);
  const unread = await unreadByThread(actor);

  return NextResponse.json({
    messages: messages.reverse().map(serializeMessage),
    team,
    unread,
    typers: activeTypers(actor.companyId, actor.id, peerId),
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

  const resolved = await resolveThread(actor, typeof body?.thread === "string" ? body.thread : null);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 });
  const { peerId } = resolved;

  const message = await prisma.teamMessage.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      recipientId: peerId,
      body: text,
    },
    select: MESSAGE_SELECT,
  });

  await markThreadSeen(actor.id, peerId); // sending means you're caught up

  return NextResponse.json(serializeMessage(message), { status: 201 });
}
