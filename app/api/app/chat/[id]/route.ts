import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { MESSAGE_SELECT, serializeMessage } from "@/lib/chat";

/** Edit (PATCH) or delete (DELETE) your own chat message. */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ error: "Message is too long (4000 characters max)." }, { status: 400 });
  }

  const message = await prisma.teamMessage.findFirst({
    where: { id, companyId: actor.companyId, userId: actor.id },
    select: { id: true, body: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const updated = await prisma.teamMessage.update({
    where: { id: message.id },
    data: { body: text, ...(text !== message.body ? { editedAt: new Date() } : {}) },
    select: MESSAGE_SELECT,
  });
  return NextResponse.json(serializeMessage(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const message = await prisma.teamMessage.findFirst({
    where: { id, companyId: actor.companyId, userId: actor.id },
    select: { id: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  await prisma.teamMessage.delete({ where: { id: message.id } });
  return NextResponse.json({ success: true });
}
