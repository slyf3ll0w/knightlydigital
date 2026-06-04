import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import Link from "next/link";

export default async function AdminClients() {
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
      include: {
        accountManager: { select: { id: true, name: true } },
        orders: { select: { id: true, status: true } },
        receivedMessages: { where: { readAt: null }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.count({ where: { toId: session.user.id, readAt: null } }),
  ]);

  return (
    <AdminShell userName={session.user.name ?? "Admin"} unreadCount={unreadCount} userRole={role}>
      <div className="max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
            <h1 className="text-3xl font-black uppercase">Clients</h1>
            <p className="text-muted-foreground text-sm mt-1">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
          </div>
          <Link href="/admin/clients/new" className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-6 py-3 hover:bg-accent/85 transition-colors shrink-0">
            + New Client
          </Link>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white border border-border p-12 text-center">
            <p className="text-muted-foreground">No clients yet. Clients are created when you set up their accounts in the database.</p>
          </div>
        ) : (
          <div className="bg-white border border-border divide-y divide-border">
            {clients.map((client) => {
              const activeOrders = client.orders.filter((o) => o.status === "ACTIVE").length;
              const pendingOrders = client.orders.filter((o) => o.status === "PENDING").length;
              const unread = client.receivedMessages.length;
              return (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="flex items-center justify-between px-6 py-5 hover:bg-muted transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-0.5">
                      <p className="font-bold text-sm group-hover:text-accent transition-colors">{client.name}</p>
                      {unread > 0 && (
                        <span className="bg-destructive text-white text-xs font-black px-1.5 py-0.5">
                          {unread} new
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {client.email}{client.company ? ` · ${client.company}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 text-xs text-right">
                    <div className="hidden sm:block">
                      <p className="font-bold text-foreground">{activeOrders}</p>
                      <p className="text-muted-foreground">Active</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="font-bold text-foreground">{pendingOrders}</p>
                      <p className="text-muted-foreground">Pending</p>
                    </div>
                    <div>
                      <p className="font-bold text-muted-foreground">
                        {client.accountManager?.name ?? "Unassigned"}
                      </p>
                      <p className="text-muted-foreground">Manager</p>
                    </div>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
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
