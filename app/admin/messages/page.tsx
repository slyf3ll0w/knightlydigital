import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import Link from "next/link";

export default async function AdminMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const role = session.user.role as string;
  const clientFilter =
    role === "STAFF"
      ? { role: "CLIENT" as const, accountManagerId: session.user.id }
      : { role: "CLIENT" as const };

  const [clients, unreadCount] = await Promise.all([
    prisma.user.findMany({
      where: clientFilter,
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        sentMessages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, fromId: true },
        },
        receivedMessages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, readAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.message.count({ where: { toId: session.user.id, readAt: null } }),
  ]);

  // Sort: clients with unread first, then by most recent message
  const sorted = [...clients].sort((a, b) => {
    const aUnread = a.receivedMessages.filter(m => !m.readAt).length;
    const bUnread = b.receivedMessages.filter(m => !m.readAt).length;
    if (aUnread !== bUnread) return bUnread - aUnread;
    const aTime = a.sentMessages[0]?.createdAt ?? a.receivedMessages[0]?.createdAt ?? new Date(0);
    const bTime = b.sentMessages[0]?.createdAt ?? b.receivedMessages[0]?.createdAt ?? new Date(0);
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return (
    <AdminShell userName={session.user.name ?? "Admin"} unreadCount={unreadCount} userRole={role}>
      <div className="max-w-3xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
          <h1 className="text-3xl font-black uppercase">Messages</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Click any client to open a conversation. You can message them first — they don&apos;t need to reach out.
          </p>
        </div>

        <div className="bg-white border border-border divide-y divide-border">
          {sorted.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">
              No clients yet. <Link href="/admin/clients/new" className="text-accent font-bold hover:underline">Add a client</Link> to start messaging.
            </p>
          ) : (
            sorted.map((client) => {
              const lastSent = client.sentMessages[0];
              const lastReceived = client.receivedMessages[0];
              const unread = client.receivedMessages.filter(m => !m.readAt).length;
              const hasMessages = lastSent || lastReceived;

              return (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="w-9 h-9 shrink-0 flex items-center justify-center text-sm font-black"
                      style={{ backgroundColor: '#0C0F0C', color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-sm group-hover:text-accent transition-colors truncate">{client.name}</p>
                        {client.company && <span className="text-xs text-muted-foreground hidden sm:block">· {client.company}</span>}
                        {unread > 0 && (
                          <span className="bg-destructive text-white text-xs font-black px-1.5 py-0.5 shrink-0">{unread} new</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {hasMessages
                          ? (lastSent ? `You: ${lastSent.body}` : lastReceived?.body)
                          : <span className="italic">No messages yet — click to start the conversation</span>
                        }
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-4 text-right">
                    {hasMessages ? (
                      <p className="text-xs text-muted-foreground">
                        {new Date(lastSent?.createdAt ?? lastReceived?.createdAt ?? "").toLocaleDateString()}
                      </p>
                    ) : (
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#22C55E' }}>
                        Start →
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </AdminShell>
  );
}
