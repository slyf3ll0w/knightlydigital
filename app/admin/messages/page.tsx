import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import Link from "next/link";

export default async function AdminMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  // Get all clients who have exchanged messages with any admin
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      OR: [
        { sentMessages: { some: {} } },
        { receivedMessages: { some: {} } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      sentMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
      receivedMessages: {
        where: { readAt: null, to: { role: "ADMIN" } },
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const unreadCount = await prisma.message.count({
    where: { toId: session.user.id, readAt: null },
  });

  return (
    <AdminShell userName={session.user.name ?? "Admin"} unreadCount={unreadCount}>
      <div className="max-w-3xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
          <h1 className="text-3xl font-black uppercase">Messages</h1>
          <p className="text-muted-foreground text-sm mt-1">Client conversations</p>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white border border-border p-12 text-center">
            <p className="text-muted-foreground">No messages yet. Messages will appear here as clients reach out.</p>
          </div>
        ) : (
          <div className="bg-white border border-border divide-y divide-border">
            {clients.map((client) => {
              const lastMsg = client.sentMessages[0];
              const unread = client.receivedMessages.length;
              return (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="flex items-center justify-between px-6 py-5 hover:bg-muted transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-sm group-hover:text-accent transition-colors">{client.name}</p>
                      {unread > 0 && (
                        <span className="bg-destructive text-white text-xs font-black px-1.5 py-0.5">{unread}</span>
                      )}
                    </div>
                    {lastMsg ? (
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{lastMsg.body}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No messages yet</p>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground ml-4">
                    {lastMsg && new Date(lastMsg.createdAt).toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
