import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { MessagesClient } from "./MessagesClient";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  const [messages] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ fromId: session.user.id }, { toId: session.user.id }] },
      include: {
        from: { select: { id: true, name: true, role: true } },
        to: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.message.updateMany({
      where: { toId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    }),
  ]);

  return (
    <MessagesClient
      initialMessages={messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      }))}
      userId={session.user.id}
      userName={session.user.name ?? ""}
    />
  );
}
