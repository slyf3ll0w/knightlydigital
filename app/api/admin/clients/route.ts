import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      phone: true,
      accountManagerId: true,
      accountManager: { select: { id: true, name: true } },
      orders: { select: { id: true, status: true } },
      receivedMessages: {
        where: { readAt: null },
        select: { id: true },
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(clients);
}
