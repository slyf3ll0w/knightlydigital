import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import {
  notifyTeamOfClientMessage,
  portalThreadContactInclude,
} from "@/lib/portal-messages";
import { suspendedResponse } from "@/lib/suspension";

/**
 * Public (hub-token-authed): the client side of the portal message thread.
 * GET lists the conversation (optionally only messages after a timestamp,
 * for polling) and marks company replies read — the hub thread being open IS
 * the read receipt. POST sends a message and wakes the team.
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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const after = req.nextUrl.searchParams.get("after");
  if (!token) return NextResponse.json({ error: "Token required." }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });

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
    where: { contactId: contact.id, direction: "OUTBOUND", readByClientAt: null },
    data: { readByClientAt: new Date() },
  });

  return NextResponse.json({ messages: messages.map(serialize) });
}

export async function POST(req: NextRequest) {
  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!token) return NextResponse.json({ error: "Token required." }, { status: 400 });
  if (!body || body.length > 5000) {
    return NextResponse.json(
      { error: "Write a message (5,000 characters max)." },
      { status: 400 }
    );
  }

  // Token + IP rate limits: a hub link is shareable, so both dimensions
  const ip = clientIp(req.headers);
  if (!limit(`hub-msg:${token}`, 30, 3600_000).ok || !limit(`hub-msg-ip:${ip}`, 60, 3600_000).ok) {
    return NextResponse.json(
      { error: "Too many messages — give us a few minutes to catch up." },
      { status: 429 }
    );
  }

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: { ...portalThreadContactInclude, company: { select: { ...portalThreadContactInclude.company.select, suspendedAt: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });
  if (contact.company.suspendedAt) {
    return suspendedResponse(
      "This business isn't receiving messages online right now. Please contact them directly."
    );
  }

  const message = await prisma.portalMessage.create({
    data: {
      companyId: contact.companyId,
      contactId: contact.id,
      direction: "INBOUND",
      body,
      via: "portal",
    },
  });

  await notifyTeamOfClientMessage(contact, message.id, body, "portal");

  return NextResponse.json(
    { message: serialize({ ...message, sender: null }) },
    { status: 201 }
  );
}
