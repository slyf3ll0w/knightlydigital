import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import Link from "next/link";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-primary text-primary-foreground",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const role = session.user.role as string;
  const isStaff = role === "STAFF";
  const clientFilter = isStaff ? { role: "CLIENT" as const, accountManagerId: session.user.id } : { role: "CLIENT" as const };
  const orderFilter = isStaff ? { client: { accountManagerId: session.user.id } } : {};

  const [clientCount, pendingOrders, recentOrders, unreadCount] = await Promise.all([
    prisma.user.count({ where: clientFilter }),
    prisma.order.count({ where: { status: "PENDING", ...orderFilter } }),
    prisma.order.findMany({
      where: orderFilter,
      include: { client: { select: { name: true, company: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.message.count({
      where: { toId: session.user.id, readAt: null },
    }),
  ]);

  return (
    <AdminShell userName={session.user.name ?? "Admin"} unreadCount={unreadCount} userRole={role}>
      <div className="max-w-5xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Streamflaire</p>
          <h1 className="text-3xl font-black uppercase">Admin Dashboard</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Clients", value: clientCount },
            { label: "Pending Orders", value: pendingOrders },
            { label: "Unread Messages", value: unreadCount },
            { label: "Active Orders", value: recentOrders.filter((o) => o.status === "ACTIVE").length },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-border p-6">
              <p className="text-3xl font-black text-accent">{s.value}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Orders */}
        <div className="bg-white border border-border mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-black uppercase text-sm tracking-wide">Recent Orders</h2>
            <Link href="/admin/orders" className="text-xs text-accent font-bold uppercase tracking-wider hover:underline">
              View All
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{order.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.client.name}{order.client.company ? ` — ${order.client.company}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 ${statusColors[order.status] ?? "bg-muted"}`}>
                      {order.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className={`grid gap-4 ${isStaff ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {[
            { href: "/admin/clients", label: "Manage Clients", icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            )},
            { href: "/admin/messages", label: "View All Messages", icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            )},
            { href: "/admin/orders", label: "Manage Orders", icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
            )},
            ...(!isStaff ? [{ href: "/admin/staff", label: "Team Members", icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            ) }] : []),
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="bg-white border border-border p-6 hover:border-accent transition-colors group"
            >
              <span className="mb-3 block text-muted-foreground group-hover:text-accent transition-colors">{l.icon}</span>
              <p className="font-black uppercase text-sm tracking-wide group-hover:text-accent transition-colors">{l.label} &rarr;</p>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
