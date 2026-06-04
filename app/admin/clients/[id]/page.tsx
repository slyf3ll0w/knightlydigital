"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useSession } from "next-auth/react";

type Client = {
  id: string; name: string; email: string; company?: string; phone?: string;
  accountManager?: { name: string; email: string } | null;
  orders: { id: string; serviceName: string; status: string; createdAt: string; notes?: string; adminNotes?: string }[];
};

type MessageUser = { id: string; name: string; role: string };
type Message = { id: string; body: string; from: MessageUser; to: MessageUser; createdAt: string; readAt: string | null };

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-primary text-primary-foreground",
  CANCELLED: "bg-red-100 text-red-700",
};

const ALL_STATUSES = ["PENDING", "IN_REVIEW", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [client, setClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"messages" | "orders" | "edit">("messages");
  const [editForm, setEditForm] = useState({ name: "", email: "", company: "", phone: "", password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  function scrollToBottom(force = false) {
    const c = msgContainerRef.current;
    if (!c) return;
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (force || nearBottom) c.scrollTop = c.scrollHeight;
  }

  async function fetchClient() {
    const res = await fetch(`/api/admin/clients/${id}`);
    if (res.ok) {
      const data = await res.json();
      setClient(data);
      setEditForm({ name: data.name ?? "", email: data.email ?? "", company: data.company ?? "", phone: data.phone ?? "", password: "" });
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    setEditMsg(null);
    const payload: Record<string, string> = {
      name: editForm.name,
      email: editForm.email,
      company: editForm.company,
      phone: editForm.phone,
    };
    if (editForm.password) payload.password = editForm.password;
    const res = await fetch(`/api/admin/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditMsg({ type: "ok", text: editForm.password ? "Password updated successfully." : "Client info updated." });
      setEditForm((p) => ({ ...p, password: "" }));
      fetchClient();
    } else {
      const d = await res.json();
      setEditMsg({ type: "err", text: d.error ?? "Something went wrong." });
    }
    setEditSaving(false);
  }

  async function fetchMessages() {
    const res = await fetch(`/api/admin/messages?clientId=${id}`);
    if (res.ok) {
      setMessages(await res.json());
    }
  }

  useEffect(() => {
    fetchClient();
    fetchMessages();
    const interval = setInterval(fetchMessages, 20000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (isFirstLoad.current && messages.length > 0) {
      isFirstLoad.current = false;
      scrollToBottom(true);
    } else {
      scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!messageBody.trim()) return;
    setSending(true);
    const res = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: messageBody, toId: id }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setMessageBody("");
      setTimeout(() => scrollToBottom(true), 50);
    }
    setSending(false);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status }),
    });
    if (res.ok) fetchClient();
  }

  if (!client) return (
    <AdminShell userName={session?.user?.name ?? "Admin"} userRole={session?.user?.role}>
      <div className="flex items-center justify-center h-32">
        <p className="text-muted-foreground text-sm">Loading client...</p>
      </div>
    </AdminShell>
  );

  return (
    <AdminShell userName={session?.user?.name ?? "Admin"} userRole={session?.user?.role}>
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Clients</p>
          <h1 className="text-3xl font-black uppercase">{client.name}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            <a href={`mailto:${client.email}`} className="hover:text-accent transition-colors">{client.email}</a>
            {client.phone && <span>· {client.phone}</span>}
            {client.company && <span>· {client.company}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mb-6">
          {([
            { key: "messages", label: `Messages (${messages.length})` },
            { key: "orders", label: `Orders (${client.orders.length})` },
            { key: "edit", label: "Edit Client" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setEditMsg(null); }}
              className={`px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
                tab === t.key
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Messages tab */}
        {tab === "messages" && (
          <div className="flex flex-col gap-0">
            <div ref={msgContainerRef} className="bg-white border border-border h-96 overflow-auto p-6 flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No messages yet — send the first one below.</p>
                </div>
              )}
              {messages.map((msg) => {
                const isMe = msg.from.role === "ADMIN" || msg.from.role === "STAFF";
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                      <div className={`px-4 py-3 text-sm leading-relaxed ${
                        isMe ? "bg-accent text-accent-foreground" : "bg-muted text-foreground border border-border"
                      }`}>
                        {msg.body}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-bold">{isMe ? "You" : msg.from.name}</span>
                        <span>·</span>
                        <span>{new Date(msg.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={handleSend} className="flex border-x border-b border-border bg-white">
              <input
                type="text"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={`Message ${client.name}...`}
                className="flex-1 px-5 py-4 text-sm focus:outline-none text-foreground placeholder-muted-foreground"
              />
              <button
                type="submit"
                disabled={sending || !messageBody.trim()}
                className="bg-accent text-accent-foreground font-bold px-6 py-4 text-xs tracking-widest uppercase hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}

        {/* Orders tab */}
        {tab === "orders" && (
          <div>
            {client.orders.length === 0 ? (
              <div className="bg-white border border-border p-10 text-center">
                <p className="text-sm text-muted-foreground">No orders from this client.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {client.orders.map((order) => (
                  <div key={order.id} className="bg-white border border-border p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-black text-base">{order.serviceName}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 shrink-0 ${statusColors[order.status] ?? "bg-muted"}`}>
                        {order.status.replace("_", " ")}
                      </span>
                    </div>
                    {order.notes && (
                      <p className="text-sm text-muted-foreground mb-4 border-l-2 border-border pl-3">{order.notes}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Update Status:</span>
                      {ALL_STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => updateOrderStatus(order.id, s)}
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
        )}

        {/* Edit tab */}
        {tab === "edit" && (
          <form onSubmit={handleSaveEdit} className="bg-white border border-border">
            <div className="p-6 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest mb-5">Client Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Company</label>
                  <input
                    type="text"
                    value={editForm.company}
                    onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))}
                    className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest mb-1">Reset Password</h2>
              <p className="text-xs text-muted-foreground mb-4">Leave blank to keep the current password unchanged.</p>
              <div className="max-w-sm">
                <input
                  type="text"
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
                  placeholder="New password"
                />
              </div>
            </div>

            {editMsg && (
              <div className={`mx-6 mt-4 px-4 py-3 text-sm font-medium border ${
                editMsg.type === "ok"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                {editMsg.text}
              </div>
            )}

            <div className="p-6">
              <button
                type="submit"
                disabled={editSaving}
                className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-8 py-3 hover:bg-accent/85 transition-colors disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminShell>
  );
}
