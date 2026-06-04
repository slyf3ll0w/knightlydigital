import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { ClientDetailClient } from "./ClientDetailClient";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  const { id } = await params;

  const [client, messages, unreadCount, onboardings] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        phone: true,
        accountManager: { select: { name: true, email: true } },
        orders: {
          select: { id: true, serviceName: true, status: true, notes: true, adminNotes: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.message.findMany({
      where: {
        OR: [
          { fromId: id, toId: session.user.id },
          { fromId: session.user.id, toId: id },
        ],
      },
      include: {
        from: { select: { id: true, name: true, role: true } },
        to: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.message.count({ where: { toId: session.user.id, readAt: null } }),
    prisma.onboarding.findMany({ where: { clientId: id } }),
  ]);

  if (!client) notFound();

  await prisma.message.updateMany({
    where: { fromId: id, toId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <ClientDetailClient
      initialClient={{
        ...client,
        company: client.company ?? undefined,
        phone: client.phone ?? undefined,
        accountManager: client.accountManager ?? undefined,
        orders: client.orders.map((o) => ({
          ...o,
          status: o.status as string,
          createdAt: o.createdAt.toISOString(),
          notes: o.notes ?? undefined,
          adminNotes: o.adminNotes ?? undefined,
        })),
      }}
      initialMessages={messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      }))}
      unreadCount={Math.max(0, unreadCount - 1)}
      adminName={session.user.name ?? "Admin"}
      adminRole={session.user.role ?? "ADMIN"}
      initialOnboardings={Object.fromEntries(
        onboardings.map((o) => [o.serviceKey, { responses: o.responses as Record<string, string | string[]>, completedAt: o.completedAt?.toISOString() ?? null }])
      )}
    />
  );
}
