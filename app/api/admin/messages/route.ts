import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const where = clientId
    ? {
        OR: [
          { fromId: clientId, toId: session.user.id },
          { fromId: session.user.id, toId: clientId },
        ],
      }
    : {
        OR: [{ fromId: session.user.id }, { toId: session.user.id }],
      };

  const messages = await prisma.message.findMany({
    where,
    include: {
      from: { select: { id: true, name: true, role: true } },
      to: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (clientId) {
    await prisma.message.updateMany({
      where: { fromId: clientId, toId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { body, toId } = await req.json();
  if (!body?.trim() || !toId) {
    return NextResponse.json({ error: "Body and recipient required" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { body: body.trim(), fromId: session.user.id, toId },
    include: {
      from: { select: { id: true, name: true, role: true } },
      to: { select: { id: true, name: true, role: true } },
    },
  });

  return NextResponse.json(message, { status: 201 });
}
