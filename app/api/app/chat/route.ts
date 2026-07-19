import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { notifyUsers } from "@/lib/push";
import {
  resolveChannel,
  listChannels,
  markChannelSeen,
  activeTypers,
  MESSAGE_SELECT,
  serializeMessage,
} from "@/lib/chat";

/**
 * Team chat. GET returns a full snapshot of the requested channel (last 100
 * messages with reactions), the actor's thread list with unread counts, the
 * company roster, and who's typing — the page polls this every few seconds,
 * so edits, deletes, and reactions propagate without extra bookkeeping.
 * Fetching a channel marks it read. POST sends a message to a channel.
 */

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channel = await resolveChannel(actor, req.nextUrl.searchParams.get("channel"));
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });

  const [messages, team] = await Promise.all([
    prisma.teamMessage.findMany({
      where: { channelId: channel.id },
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

  await markChannelSeen(actor.id, channel);
  const channels = await listChannels(actor);

  return NextResponse.json({
    channelId: channel.id,
    messages: messages.reverse().map(serializeMessage),
    team,
    channels,
    typers: activeTypers(channel.id, actor.id),
  });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = limit(`chat-message:${actor.id}`, 30, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're sending messages too fast — give it a few seconds." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ error: "Message is too long (4000 characters max)." }, { status: 400 });
  }

  const channel = await resolveChannel(
    actor,
    typeof body?.channel === "string" ? body.channel : null
  );
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });

  const message = await prisma.teamMessage.create({
    data: {
      companyId: actor.companyId,
      channelId: channel.id,
      userId: actor.id,
      body: text,
    },
    select: MESSAGE_SELECT,
  });
  await prisma.chatChannel.update({
    where: { id: channel.id },
    data: { lastMessageAt: new Date() },
  });
  await markChannelSeen(actor.id, channel); // sending means you're caught up

  // Push to the other members. One tag per channel so a burst of messages
  // collapses into the latest notification.
  const recipients = channel.memberIds.filter((id) => id !== actor.id);
  await notifyUsers(recipients, {
    title: channel.isEveryone
      ? `${actor.name} · Everyone`
      : channel.name
        ? `${actor.name} · ${channel.name}`
        : actor.name,
    body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
    url: "/app/chat",
    tag: `chat-${channel.id}`,
  });

  return NextResponse.json(serializeMessage(message), { status: 201 });
}
