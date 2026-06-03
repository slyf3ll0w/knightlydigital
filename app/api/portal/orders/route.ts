import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { clientId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { serviceName, notes } = await req.json();
  if (!serviceName?.trim()) return NextResponse.json({ error: "Service name required" }, { status: 400 });

  const order = await prisma.order.create({
    data: {
      clientId: session.user.id,
      serviceName: serviceName.trim(),
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json(order, { status: 201 });
}
