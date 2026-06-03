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

const statusLabel: Record<string, string> = {
  PENDING: "Pending Review",
  IN_REVIEW: "In Review",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const [orders, unreadCount] = await Promise.all([
    prisma.order.findMany({
      where: { clientId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.count({
      where: { toId: session.user.id, readAt: null },
    }),
  ]);

  return (
    <PortalShell userName={session.user.name ?? "Client"} unreadCount={unreadCount}>
      <div className="max-w-3xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Portal</p>
            <h1 className="text-3xl font-black uppercase">My Orders</h1>
          </div>
          <Link
            href="/portal/orders/new"
            className="bg-accent text-accent-foreground font-bold px-6 py-3 text-xs tracking-widest uppercase hover:bg-accent/85 transition-colors"
          >
            + Request Service
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white border border-border p-12 text-center">
            <p className="text-muted-foreground mb-4">You haven&apos;t placed any orders yet.</p>
            <Link
              href="/portal/orders/new"
              className="text-sm font-bold uppercase tracking-widest text-accent hover:underline"
            >
              Request Your First Service &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-0 border border-border">
            {orders.map((order, i) => (
              <div
                key={order.id}
                className={`bg-white p-6 ${i < orders.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <h3 className="font-black text-base">{order.serviceName}</h3>
                      <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 ${statusColors[order.status] ?? "bg-muted"}`}>
                        {statusLabel[order.status] ?? order.status}
                      </span>
                    </div>
                    {order.notes && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-2">{order.notes}</p>
                    )}
                    {order.adminNotes && (
                      <div className="mt-2 border-l-2 border-accent pl-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Team Note</p>
                        <p className="text-sm text-foreground">{order.adminNotes}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
