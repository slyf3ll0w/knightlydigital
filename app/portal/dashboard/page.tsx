import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { PortalShell } from "@/components/PortalShell";
import Link from "next/link";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-primary text-primary-foreground",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function ClientDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const [user, orders, unreadCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accountManager: { select: { name: true, email: true } } },
    }),
    prisma.order.findMany({
      where: { clientId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({
      where: { toId: session.user.id, readAt: null },
    }),
  ]);

  return (
    <PortalShell userName={session.user.name ?? "Client"} unreadCount={unreadCount}>
      <div className="max-w-5xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Welcome back</p>
          <h1 className="text-3xl font-black uppercase">{user?.name}</h1>
          {user?.company && <p className="text-muted-foreground text-sm mt-1">{user.company}</p>}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-border p-6">
            <p className="text-3xl font-black text-accent">{orders.length}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">Total Orders</p>
          </div>
          <div className="bg-white border border-border p-6">
            <p className="text-3xl font-black text-accent">
              {orders.filter((o) => o.status === "ACTIVE").length}
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">Active Services</p>
          </div>
          <div className="bg-white border border-border p-6 col-span-2 lg:col-span-1">
            <p className="text-3xl font-black text-accent">{unreadCount}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">Unread Messages</p>
          </div>
        </div>

        {/* Two columns */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent orders */}
          <div className="bg-white border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-black uppercase text-sm tracking-wide">Recent Orders</h2>
              <Link href="/portal/orders" className="text-xs text-accent font-bold uppercase tracking-wider hover:underline">
                View All
              </Link>
            </div>
            <div className="divide-y divide-border">
              {orders.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No orders yet.</p>
                  <Link href="/portal/orders/new" className="text-xs font-bold uppercase tracking-widest text-accent hover:underline">
                    Request a Service &rarr;
                  </Link>
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">{order.serviceName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 shrink-0 ${statusColors[order.status] ?? "bg-muted"}`}>
                        {order.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {orders.length > 0 && (
              <div className="px-6 py-4 border-t border-border">
                <Link href="/portal/orders/new" className="text-xs font-bold uppercase tracking-widest text-accent hover:underline">
                  + Request New Service
                </Link>
              </div>
            )}
          </div>

          {/* Account manager + actions */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-border p-6">
              <h2 className="font-black uppercase text-sm tracking-wide mb-4">Your Account Manager</h2>
              {user?.accountManager ? (
                <div>
                  <p className="font-bold text-base">{user.accountManager.name}</p>
                  <a href={`mailto:${user.accountManager.email}`} className="text-sm text-accent hover:underline">
                    {user.accountManager.email}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Your account manager will be assigned shortly.</p>
              )}
            </div>

            <div className="bg-primary text-primary-foreground p-6">
              <h2 className="font-black uppercase text-sm tracking-wide mb-3">Quick Actions</h2>
              <div className="flex flex-col gap-2">
                <Link
                  href="/portal/messages"
                  className="flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                >
                  <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  Message Your Account Manager
                </Link>
                <Link
                  href="/portal/orders/new"
                  className="flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                >
                  <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                  </svg>
                  Request a New Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
