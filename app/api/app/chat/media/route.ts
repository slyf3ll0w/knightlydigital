import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { notifyUsers } from "@/lib/push";
import { resolveChannel, markChannelSeen, MESSAGE_SELECT, serializeMessage } from "@/lib/chat";
import { CHAT_MAX_BYTES, CHAT_TYPES, mediaNoun, storeMessageMedia } from "@/lib/message-media";

/**
 * POST multipart — a photo (or clip) in team chat, with optional words: one
 * chat message carrying the attachment. Stored like a texting photo
 * (lib/message-media.ts: R2 or Postgres, served by /api/message-media/[id],
 * bytes dropped after MESSAGE_MEDIA_DAYS). Field names: `file` (required),
 * `channel`, `body` (optional).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await limit(`chat-message:${actor.id}`, 30, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're sending messages too fast — give it a few seconds." },
      { status: 429 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a photo or video to send." }, { status: 400 });
  const contentType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!CHAT_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Photos and videos can be sent in chat." }, { status: 415 });
  }
  if (file.size > CHAT_MAX_BYTES) {
    return NextResponse.json({ error: "That file is too big — keep it under 25 MB." }, { status: 413 });
  }
  const bodyRaw = form?.get("body");
  const text = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, 4000) : "";
  const channelRaw = form?.get("channel");
  const channel = await resolveChannel(actor, typeof channelRaw === "string" ? channelRaw : null);
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });

  const created = await prisma.teamMessage.create({
    data: { companyId: actor.companyId, channelId: channel.id, userId: actor.id, body: text },
    select: { id: true },
  });
  try {
    await storeMessageMedia({ companyId: actor.companyId, teamMessageId: created.id, bytes, contentType });
  } catch (err) {
    reportError("[chat] media store failed:", err);
    await prisma.teamMessage.delete({ where: { id: created.id } }).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 500 });
  }
  const message = await prisma.teamMessage.findUniqueOrThrow({ where: { id: created.id }, select: MESSAGE_SELECT });

  await prisma.chatChannel.update({ where: { id: channel.id }, data: { lastMessageAt: new Date() } });
  await markChannelSeen(actor.id, channel);

  const recipients = channel.memberIds.filter((id) => id !== actor.id);
  await notifyUsers(recipients, {
    title: channel.isEveryone
      ? `${actor.name} · Everyone`
      : channel.name
        ? `${actor.name} · ${channel.name}`
        : actor.name,
    body: text ? (text.length > 140 ? `${text.slice(0, 139)}…` : text) : `Sent a ${mediaNoun(contentType).toLowerCase()}`,
    url: "/app/chat",
    tag: `chat-${channel.id}`,
  });

  return NextResponse.json(serializeMessage(message), { status: 201 });
}
