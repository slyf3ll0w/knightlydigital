import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import {
  notifyClientOfReply,
  portalThreadContactInclude,
} from "@/lib/portal-messages";

/**
 * Team side of a portal message thread. GET polls for new messages (and
 * marks client messages read — the open thread is the read receipt); POST
 * sends a reply, which fans out to the client as push + SMS mirror + email.
 */

const serialize = (m: {
  id: string;
  direction: string;
  body: string;
  via: string;
  createdAt: Date;
  sender: { name: string | null } | null;
}) => ({
  id: m.id,
  direction: m.direction,
  body: m.body,
  via: m.via,
  createdAt: m.createdAt.toISOString(),
  senderName: m.sender?.name ?? null,
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const messages = await prisma.portalMessage.findMany({
    where: {
      contactId: contact.id,
      ...(afterDate && !isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { sender: { select: { name: true } } },
  });

  await prisma.portalMessage.updateMany({
    where: { contactId: contact.id, direction: "INBOUND", readByTeamAt: null },
    data: { readByTeamAt: new Date() },
  });

  return NextResponse.json({ messages: messages.map(serialize) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    include: portalThreadContactInclude,
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const data = await req.json().catch(() => null);
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || body.length > 5000) {
    return NextResponse.json(
      { error: "Write a message (5,000 characters max)." },
      { status: 400 }
    );
  }

  const message = await prisma.portalMessage.create({
    data: {
      companyId: actor.companyId,
      contactId: contact.id,
      direction: "OUTBOUND",
      senderId: actor.id,
      body,
      via: "portal",
    },
    include: { sender: { select: { name: true } } },
  });

  await notifyClientOfReply(contact, message.id, body);

  return NextResponse.json({ message: serialize(message) }, { status: 201 });
}
