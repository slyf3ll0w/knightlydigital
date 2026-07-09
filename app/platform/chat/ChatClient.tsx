"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, SendHorizonal, Loader2 } from "lucide-react";
import Avatar from "@/components/Avatar";

// Mirrors lib/permissions.ts (server-only module — client components keep a copy)
const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  USER: "Sales + Tech",
  SALES: "Sales",
  TECH: "Tech",
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  userName: string;
};

type Member = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
};

const POLL_MS = 4000;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** Call button for a teammate — only renders when they have a phone on file. */
function CallButton({ member, compact = false }: { member: Member; compact?: boolean }) {
  if (!member.phone) return null;
  return (
    <a
      href={telHref(member.phone)}
      title={`Call ${member.name} (${member.phone})`}
      className={`inline-flex items-center gap-1.5 rounded border border-green-200 bg-green-50 font-medium text-green-700 transition-colors hover:bg-green-100 ${
        compact ? "p-1.5" : "px-2.5 py-1.5 text-xs"
      }`}
    >
      <Phone size={compact ? 13 : 12} />
      {!compact && "Call"}
    </a>
  );
}

export default function ChatClient({
  meId,
  team,
  initialMessages,
}: {
  meId: string;
  team: Member[];
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastStampRef = useRef<string>(initialMessages[initialMessages.length - 1]?.createdAt ?? "");
  const stickToBottomRef = useRef(true);

  const teammates = team.filter((m) => m.id !== meId);

  function appendNew(incoming: Message[]) {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh];
    });
    const last = incoming[incoming.length - 1];
    if (last.createdAt > lastStampRef.current) lastStampRef.current = last.createdAt;
  }

  // Poll for teammates' messages while the tab is visible
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/app/chat?after=${encodeURIComponent(lastStampRef.current)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.messages)) appendNew(data.messages);
      } catch {
        /* transient network error — next tick retries */
      }
    }
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Keep the view pinned to the newest message unless the user scrolled up
  useEffect(() => {
    if (stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/app/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send — try again.");
        return;
      }
      stickToBottomRef.current = true;
      appendNew([data]);
      setDraft("");
    } catch {
      setError("Couldn't send — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const memberById = new Map(team.map((m) => [m.id, m]));

  return (
    <div className="flex h-full flex-col p-4 lg:p-6 max-w-5xl mx-auto w-full">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Team Chat</h1>
          <p className="text-sm text-gray-500">
            Everyone on your team sees this conversation
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation */}
        <div className="card-ledger flex min-h-0 flex-1 flex-col">
          {/* Mobile roster strip (sidebar is hidden below lg) */}
          <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-100 px-4 py-2.5 lg:hidden">
            {teammates.map((m) => (
              <span key={m.id} className="flex shrink-0 items-center gap-1.5">
                <Avatar name={m.name} size={22} />
                <span className="text-xs font-medium text-gray-700">{m.name.split(" ")[0]}</span>
                <CallButton member={m} compact />
              </span>
            ))}
          </div>

          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 space-y-1 overflow-y-auto px-4 py-4"
          >
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">
                No messages yet — say hi to your team.
              </p>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.userId === meId;
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const newSpeaker = newDay || !prev || prev.userId !== m.userId;
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-gray-100" aria-hidden />
                      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        {dayLabel(m.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-gray-100" aria-hidden />
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} ${newSpeaker ? "mt-2" : ""}`}>
                    <div className={`flex max-w-[85%] items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      {!mine && (
                        <span className="w-[26px] shrink-0">
                          {newSpeaker && <Avatar name={m.userName} size={26} />}
                        </span>
                      )}
                      <div>
                        {newSpeaker && !mine && (
                          <p className="mb-0.5 ml-1 text-[11px] font-medium text-gray-500">
                            {m.userName}
                            <span className="ml-1.5 font-normal text-gray-400">
                              {timeLabel(m.createdAt)}
                            </span>
                          </p>
                        )}
                        {newSpeaker && mine && (
                          <p className="mb-0.5 mr-1 text-right text-[11px] text-gray-400">
                            {timeLabel(m.createdAt)}
                          </p>
                        )}
                        <div
                          className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${
                            mine
                              ? "bg-[#0C0F0C] text-white"
                              : "border border-gray-200 bg-white text-gray-800"
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={send} className="border-t border-gray-100 p-3">
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Message your team..."
                className="max-h-32 min-h-[42px] flex-1 resize-y rounded border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="chamfer rounded bg-green-500 p-2.5 text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <SendHorizonal size={18} />
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Roster */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="card-ledger p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Team · {team.length}
            </h2>
            <ul className="space-y-3">
              {team.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {m.name}
                      {m.id === meId && <span className="text-gray-400"> (you)</span>}
                    </p>
                    <p className="truncate text-[11px] text-gray-400">
                      {roleLabel[m.role] ?? m.role}
                    </p>
                  </div>
                  {m.id !== meId && <CallButton member={m} />}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
