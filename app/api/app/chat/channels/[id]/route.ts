import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { resolveChannel } from "@/lib/chat";

/**
 * PATCH — rename a group or add members ({ name?, addMemberIds? }); any
 * member may do either (WhatsApp-style).
 * DELETE — leave a group; the last member out deletes it (and its messages).
 * The Everyone channel and DMs can't be renamed, expanded, or left.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channel = await resolveChannel(actor, id);
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });
  if (channel.isEveryone || channel.memberIds.length <= 2) {
    return NextResponse.json({ error: "Only group chats can be changed." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  if (typeof body.name === "string") {
    await prisma.chatChannel.update({
      where: { id: channel.id },
      data: { name: body.name.trim().slice(0, 60) || null },
    });
  }

  if (Array.isArray(body.addMemberIds) && body.addMemberIds.length > 0) {
    const ids: string[] = body.addMemberIds.filter(
      (v: unknown): v is string => typeof v === "string"
    );
    const valid = await prisma.user.findMany({
      where: { id: { in: ids }, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    await prisma.chatChannelMember.createMany({
      data: valid.map((u) => ({ channelId: channel.id, userId: u.id })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channel = await resolveChannel(actor, id);
  if (!channel) return NextResponse.json({ error: "That chat isn't available." }, { status: 404 });
  if (channel.isEveryone) {
    return NextResponse.json({ error: "You can't leave the Everyone channel." }, { status: 400 });
  }
  if (channel.memberIds.length <= 2) {
    return NextResponse.json({ error: "DMs can't be left — just let them sit." }, { status: 400 });
  }

  await prisma.chatChannelMember.deleteMany({
    where: { channelId: channel.id, userId: actor.id },
  });
  const remaining = await prisma.chatChannelMember.count({ where: { channelId: channel.id } });
  if (remaining === 0) {
    await prisma.chatChannel.delete({ where: { id: channel.id } }); // messages cascade
  }
  return NextResponse.json({ success: true });
}
