"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Order = {
  id: string;
  serviceName: string;
  status: string;
  notes?: string;
  adminNotes?: string;
  createdAt: string;
  client: { id: string; name: string; email: string; company?: string };
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-primary text-primary-foreground",
  CANCELLED: "bg-red-100 text-red-700",
};

const ALL_STATUSES = ["PENDING", "IN_REVIEW", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

export default function AdminOrdersPage() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");

  async function fetchOrders() {
    const res = await fetch("/api/admin/orders");
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, []);

  async function updateStatus(orderId: string, status: string) {
    await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status }),
    });
    fetchOrders();
  }

  const filtered = filterStatus === "ALL" ? orders : orders.filter((o) => o.status === filterStatus);

  return (
    <AdminShell userName={session?.user?.name ?? "Admin"}>
      <div className="max-w-5xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
          <h1 className="text-3xl font-black uppercase">Orders</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap mb-6">
          {["ALL", ...ALL_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors border ${
                filterStatus === s
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-white text-muted-foreground border-border hover:border-accent hover:text-accent"
              }`}
            >
              {s.replace("_", " ")} {s !== "ALL" && `(${orders.filter((o) => o.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading orders...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">No orders in this category.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((order) => (
              <div key={order.id} className="bg-white border border-border p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-black text-base mb-0.5">{order.serviceName}</h3>
                    <Link
                      href={`/admin/clients/${order.client.id}`}
                      className="text-xs text-accent hover:underline font-bold"
                    >
                      {order.client.name}{order.client.company ? ` — ${order.client.company}` : ""}
                    </Link>
                    <span className="text-xs text-muted-foreground ml-2">{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 shrink-0 ${statusColors[order.status] ?? "bg-muted"}`}>
                    {order.status.replace("_", " ")}
                  </span>
                </div>
                {order.notes && (
                  <p className="text-sm text-muted-foreground mb-3 border-l-2 border-border pl-3">{order.notes}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status:</span>
                  {ALL_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(order.id, s)}
                      className={`text-xs px-2 py-1 font-bold uppercase tracking-wide transition-colors border ${
                        order.status === s
                          ? "bg-accent text-accent-foreground border-accent"
                          : "bg-white text-muted-foreground border-border hover:border-accent hover:text-accent"
                      }`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
