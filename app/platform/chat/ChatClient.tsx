"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Phone,
  SendHorizonal,
  Loader2,
  SmilePlus,
  Pencil,
  Trash2,
  Users as UsersIcon,
  Check,
  X,
} from "lucide-react";
import Avatar from "@/components/Avatar";

// Mirrors lib/permissions.ts (server-only module — client components keep a copy)
const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  USER: "Sales + Tech",
  SALES: "Sales",
  TECH: "Tech",
};

// Mirrors TAPBACKS in lib/chat.ts (server module)
const TAPBACKS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

type Reaction = { emoji: string; userId: string };

type Message = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  userId: string;
  userName: string;
  reactions: Reaction[];
};

type Member = { id: string; name: string; role: string; phone: string | null };

type Unread = { company: number; dms: Record<string, number> };

const POLL_MS = 4000;
const TYPING_PING_MS = 2500;

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

/** Render message text with URLs as links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function CallButton({ member, compact = false }: { member: Member; compact?: boolean }) {
  if (!member.phone) return null;
  return (
    <a
      href={telHref(member.phone)}
      title={`Call ${member.name} (${member.phone})`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 rounded border border-green-200 bg-green-50 font-medium text-green-700 transition-colors hover:bg-green-100 ${
        compact ? "p-1.5" : "px-2.5 py-1.5 text-xs"
      }`}
    >
      <Phone size={compact ? 13 : 12} />
      {!compact && "Call"}
    </a>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-[18px] rounded-full bg-green-500 px-1.5 py-px text-center text-[10px] font-bold tabular-nums text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function ChatClient({
  meId,
  team,
  initialMessages,
  initialUnread,
}: {
  meId: string;
  team: Member[];
  initialMessages: Message[];
  initialUnread: Unread;
}) {
  const [thread, setThread] = useState<string>("company");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loadingThread, setLoadingThread] = useState(false);
  const [unread, setUnread] = useState<Unread>(initialUnread);
  const [typers, setTypers] = useState<string[]>([]);
  const [roster, setRoster] = useState<Member[]>(team);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const lastTypingPingRef = useRef(0);

  const teammates = roster.filter((m) => m.id !== meId);
  const dmsEnabled = roster.length >= 3; // 2-person teams: the channel IS the DM
  const memberById = new Map(roster.map((m) => [m.id, m]));
  const activePeer = thread === "company" ? null : (memberById.get(thread) ?? null);

  const refresh = useCallback(async (forThread: string) => {
    try {
      const res = await fetch(`/api/app/chat?thread=${encodeURIComponent(forThread)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (threadRef.current !== forThread) return; // user switched mid-flight
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (data.unread) setUnread(data.unread);
      if (Array.isArray(data.typers)) setTypers(data.typers);
      if (Array.isArray(data.team)) setRoster(data.team);
    } catch {
      /* transient network error — next tick retries */
    }
  }, []);

  // Poll the active thread while the tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh(threadRef.current);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function switchThread(next: string) {
    if (next === thread) return;
    setThread(next);
    setMessages([]);
    setTypers([]);
    setEditingId(null);
    setPickerFor(null);
    setError("");
    stickToBottomRef.current = true;
    setLoadingThread(true);
    threadRef.current = next;
    await refresh(next);
    setLoadingThread(false);
  }

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

  function pingTyping() {
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_MS) return;
    lastTypingPingRef.current = now;
    fetch("/api/app/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: threadRef.current }),
    }).catch(() => {});
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
        body: JSON.stringify({ thread, body: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send — try again.");
        return;
      }
      stickToBottomRef.current = true;
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setDraft("");
    } catch {
      setError("Couldn't send — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerFor(null);
    // Optimistic flip; the next poll is the source of truth
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const mine = m.reactions.some((r) => r.userId === meId && r.emoji === emoji);
        return {
          ...m,
          reactions: mine
            ? m.reactions.filter((r) => !(r.userId === meId && r.emoji === emoji))
            : [...m.reactions, { userId: meId, emoji }],
        };
      })
    );
    await fetch(`/api/app/chat/${messageId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  }

  async function saveEdit(messageId: string) {
    const text = editDraft.trim();
    if (!text) return;
    const res = await fetch(`/api/app/chat/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data : m)));
    }
    setEditingId(null);
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Delete this message for everyone?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await fetch(`/api/app/chat/${messageId}`, { method: "DELETE" }).catch(() => {});
  }

  const typerNames = typers
    .map((id) => memberById.get(id)?.name.split(" ")[0])
    .filter(Boolean) as string[];

  const threadRow = (key: string, label: string, member: Member | null, count: number) => {
    const active = thread === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => switchThread(key)}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
          active ? "bg-green-50 ring-1 ring-green-200" : "hover:bg-gray-50"
        }`}
      >
        {member ? (
          <Avatar name={member.name} size={28} />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0C0F0C] text-green-400">
            <UsersIcon size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-800">{label}</span>
          {member && (
            <span className="block truncate text-[11px] text-gray-400">
              {roleLabel[member.role] ?? member.role}
            </span>
          )}
        </span>
        <UnreadBadge count={count} />
        {member && <CallButton member={member} compact />}
      </button>
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Team Chat</h1>
        <p className="text-sm text-gray-500">
          {dmsEnabled
            ? "Message the whole team or anyone directly"
            : "Everyone on your team sees this conversation"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Thread list / roster (desktop) */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card-ledger space-y-4 p-3">
            <div>
              <h2 className="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Channel
              </h2>
              {threadRow("company", "Everyone", null, unread.company)}
            </div>
            <div>
              <h2 className="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {dmsEnabled ? "Direct messages" : `Team · ${roster.length}`}
              </h2>
              <div className="space-y-0.5">
                {teammates.map((m) =>
                  dmsEnabled ? (
                    threadRow(m.id, m.name, m, unread.dms[m.id] ?? 0)
                  ) : (
                    <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-2">
                      <Avatar name={m.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {m.name}
                        </span>
                        <span className="block truncate text-[11px] text-gray-400">
                          {roleLabel[m.role] ?? m.role}
                        </span>
                      </span>
                      <CallButton member={m} />
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Conversation */}
        <div className="card-ledger flex min-h-0 flex-1 flex-col">
          {/* Thread switcher (mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => switchThread("company")}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                thread === "company"
                  ? "bg-[#0C0F0C] text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <UsersIcon size={12} />
              Everyone
              {unread.company > 0 && thread !== "company" && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </button>
            {dmsEnabled &&
              teammates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchThread(m.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                    thread === m.id ? "bg-[#0C0F0C] text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {m.name.split(" ")[0]}
                  {(unread.dms[m.id] ?? 0) > 0 && thread !== m.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
          </div>

          {/* Active thread header */}
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5">
            {activePeer ? (
              <>
                <Avatar name={activePeer.name} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{activePeer.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {roleLabel[activePeer.role] ?? activePeer.role} · Only you two can see this
                  </p>
                </div>
                <CallButton member={activePeer} />
              </>
            ) : (
              <>
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#0C0F0C] text-green-400">
                  <UsersIcon size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Everyone</p>
                  <p className="text-[11px] text-gray-400">
                    {roster.length} members · visible to the whole team
                  </p>
                </div>
              </>
            )}
          </div>

          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 space-y-1 overflow-y-auto px-4 py-4"
          >
            {loadingThread && (
              <p className="py-10 text-center text-sm text-gray-400">
                <Loader2 size={16} className="mr-1.5 inline animate-spin" />
                Loading…
              </p>
            )}
            {!loadingThread && messages.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">
                {activePeer
                  ? `No messages with ${activePeer.name.split(" ")[0]} yet — start the conversation.`
                  : "No messages yet — say hi to your team."}
              </p>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.userId === meId;
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const newSpeaker = newDay || !prev || prev.userId !== m.userId;
              const reactionGroups = Object.entries(
                m.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
                  const g = (acc[r.emoji] ??= { count: 0, mine: false });
                  g.count++;
                  if (r.userId === meId) g.mine = true;
                  return acc;
                }, {})
              );
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
                  <div
                    className={`group flex ${mine ? "justify-end" : "justify-start"} ${
                      newSpeaker ? "mt-2" : ""
                    }`}
                  >
                    <div className={`flex max-w-[85%] items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      {!mine && thread === "company" && (
                        <span className="w-[26px] shrink-0">
                          {newSpeaker && <Avatar name={m.userName} size={26} />}
                        </span>
                      )}
                      <div className="relative">
                        {newSpeaker && !mine && (
                          <p className="mb-0.5 ml-1 text-[11px] font-medium text-gray-500">
                            {thread === "company" && m.userName}
                            <span className={`font-normal text-gray-400 ${thread === "company" ? "ml-1.5" : ""}`}>
                              {timeLabel(m.createdAt)}
                            </span>
                          </p>
                        )}
                        {newSpeaker && mine && (
                          <p className="mb-0.5 mr-1 text-right text-[11px] text-gray-400">
                            {timeLabel(m.createdAt)}
                          </p>
                        )}

                        {editingId === m.id ? (
                          <div className="w-64">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={2}
                              maxLength={4000}
                              autoFocus
                              className="w-full resize-y rounded border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <div className="mt-1 flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                                aria-label="Cancel edit"
                              >
                                <X size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEdit(m.id)}
                                className="rounded bg-green-500 p-1.5 text-white hover:bg-green-600"
                                aria-label="Save edit"
                              >
                                <Check size={13} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${
                              mine
                                ? "bg-[#0C0F0C] text-white"
                                : "border border-gray-200 bg-white text-gray-800"
                            }`}
                          >
                            <Linkified text={m.body} />
                            {m.editedAt && (
                              <span className={`ml-1.5 text-[10px] ${mine ? "text-white/50" : "text-gray-400"}`}>
                                (edited)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Tapback chips */}
                        {reactionGroups.length > 0 && (
                          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                            {reactionGroups.map(([emoji, g]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(m.id, emoji)}
                                className={`rounded-full border px-1.5 py-px text-xs tabular-nums transition-colors ${
                                  g.mine
                                    ? "border-green-300 bg-green-50"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                                }`}
                              >
                                {emoji} {g.count > 1 ? g.count : ""}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Hover actions */}
                        {editingId !== m.id && (
                          <div
                            className={`absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex ${
                              mine ? "left-0 -translate-x-1" : "right-0 translate-x-1"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                              className="rounded-full p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                              aria-label="React"
                            >
                              <SmilePlus size={13} />
                            </button>
                            {mine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(m.id);
                                    setEditDraft(m.body);
                                    setPickerFor(null);
                                  }}
                                  className="rounded-full p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                                  aria-label="Edit"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteMessage(m.id)}
                                  className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  aria-label="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Tapback picker */}
                        {pickerFor === m.id && (
                          <div
                            className={`absolute -top-11 z-20 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg ${
                              mine ? "right-0" : "left-0"
                            }`}
                          >
                            {TAPBACKS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(m.id, emoji)}
                                className="rounded-full p-1 text-base transition-transform hover:scale-125"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={send} className="border-t border-gray-100 p-3">
            <p className="mb-1 h-4 pl-1 text-[11px] text-gray-400">
              {typerNames.length > 0 &&
                `${typerNames.join(", ")} ${typerNames.length === 1 ? "is" : "are"} typing…`}
            </p>
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value.trim()) pingTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={
                  activePeer ? `Message ${activePeer.name.split(" ")[0]}...` : "Message your team..."
                }
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
      </div>
    </div>
  );
}
