import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const messages = await prisma.message.findMany({
    where: {
      OR: [{ fromId: session.user.id }, { toId: session.user.id }],
    },
    include: {
      from: { select: { id: true, name: true, role: true } },
      to: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { toId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message body required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let toId = user.accountManagerId;
  if (!toId) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) return NextResponse.json({ error: "No admin available" }, { status: 500 });
    toId = admin.id;
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
