"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  SendHorizonal,
  SmilePlus,
  Trash2,
  Users as UsersIcon,
  X,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { hapticImpact } from "@/lib/haptics";

// Mirrors TAPBACKS in lib/chat.ts (server module)
const TAPBACKS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

type Reaction = { emoji: string; userId: string };

type Message = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  userId: string;
  userName: string;
  reactions: Reaction[];
};

type Member = { id: string; name: string; role: string; phone: string | null };

type Channel = {
  id: string;
  kind: "everyone" | "dm" | "group";
  name: string;
  memberIds: string[];
  memberCount: number;
  unread: number;
  lastMessage: { body: string; userName: string; at: string; deleted: boolean } | null;
};

const POLL_MS = 4000;
const TYPING_PING_MS = 2500;
const LONG_PRESS_MS = 350;

// Group-chat sender name colors (Discord/WhatsApp style), hashed per user
const NAME_COLORS = ["#3B82F6", "#F59E0B", "#8B5CF6", "#F97316", "#0EA5E9", "#14B8A6", "#EC4899", "#6366F1"];
function nameColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

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

/** Thread-list timestamp: time today, weekday this week, else date. */
function listTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (dayLabel(iso) === "Today") return timeLabel(iso);
  if (diff < 6 * 86400000) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ChannelIcon({ channel, size = 40 }: { channel: Channel; size?: number }) {
  if (channel.kind === "everyone") {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-[#0C0F0C] text-green-400"
        style={{ width: size, height: size }}
      >
        <UsersIcon size={size * 0.45} />
      </span>
    );
  }
  if (channel.kind === "group") {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600"
        style={{ width: size, height: size }}
      >
        <UsersIcon size={size * 0.45} />
      </span>
    );
  }
  return <Avatar name={channel.name} size={size} />;
}

export default function ChatClient({
  meId,
  team,
  everyoneId,
  initialChannels,
  initialMessages,
}: {
  meId: string;
  team: Member[];
  everyoneId: string;
  initialChannels: Channel[];
  initialMessages: Message[];
}) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [roster, setRoster] = useState<Member[]>(team);
  const [activeId, setActiveId] = useState<string>(everyoneId);
  // Mobile shows the thread list until a conversation is opened; desktop
  // always shows the active conversation beside the list.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loadingThread, setLoadingThread] = useState(false);
  const [typers, setTypers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null); // desktop inline picker
  // iMessage-style long-press sheet: the message + its bubble's viewport rect
  const [pressed, setPressed] = useState<{ msg: Message; rect: DOMRect; mine: boolean } | null>(null);
  const [showNewChat, setShowNewChat] = useState<false | "create" | "add">(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const lastTypingPingRef = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const memberById = new Map(roster.map((m) => [m.id, m]));
  const active = channels.find((c) => c.id === activeId) ?? channels[0];
  const activePeer =
    active?.kind === "dm"
      ? (memberById.get(active.memberIds.find((id) => id !== meId) ?? "") ?? null)
      : null;

  const refresh = useCallback(async (forChannel: string) => {
    try {
      const res = await fetch(`/api/app/chat?channel=${encodeURIComponent(forChannel)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.channels)) setChannels(data.channels);
      if (Array.isArray(data.team)) setRoster(data.team);
      if (activeRef.current !== forChannel) return; // user switched mid-flight
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (Array.isArray(data.typers)) setTypers(data.typers);
    } catch {
      /* transient network error — next tick retries */
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function openChannel(id: string) {
    // The fixed conversation overlay is a phone thing — on desktop the
    // conversation pane is already visible (and double-mounting it would
    // duplicate the composer in the DOM)
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      setMobileOpen(true);
    }
    if (id === activeId) return;
    setActiveId(id);
    activeRef.current = id;
    setMessages([]);
    setTypers([]);
    setEditingId(null);
    setPickerFor(null);
    setPressed(null);
    setError("");
    stickToBottomRef.current = true;
    setLoadingThread(true);
    await refresh(id);
    setLoadingThread(false);
  }

  // Keep the view pinned to the newest message unless the user scrolled up
  useEffect(() => {
    if (stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typers, mobileOpen]);

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
      body: JSON.stringify({ channel: activeRef.current }),
    }).catch(() => {});
  }

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/app/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeId, body: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send — try again.");
        return;
      }
      stickToBottomRef.current = true;
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setDraft("");
      requestAnimationFrame(autoGrow);
    } catch {
      setError("Couldn't send — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerFor(null);
    setPressed(null);
    hapticImpact("LIGHT");
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
    setPressed(null);
    if (!confirm("Delete this message? Everyone will see it was deleted.")) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, body: "", deletedAt: new Date().toISOString(), reactions: [] } : m
      )
    );
    await fetch(`/api/app/chat/${messageId}`, { method: "DELETE" }).catch(() => {});
  }

  // ── long-press (touch) → iMessage sheet ────────────────────────────────────

  function pressHandlers(m: Message, mine: boolean) {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        if (m.deletedAt) return;
        const t = e.touches[0];
        pressStart.current = { x: t.clientX, y: t.clientY };
        const target = e.currentTarget as HTMLElement;
        pressTimer.current = setTimeout(() => {
          hapticImpact("MEDIUM");
          setPressed({ msg: m, rect: target.getBoundingClientRect(), mine });
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!pressStart.current || !pressTimer.current) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - pressStart.current.x, t.clientY - pressStart.current.y) > 10) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
      },
      onTouchEnd: () => {
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
      },
      onContextMenu: (e: React.MouseEvent) => {
        // long-press fires contextmenu on some browsers — the sheet replaces it
        if (pressed || pressTimer.current) e.preventDefault();
      },
    };
  }

  async function createChat() {
    if (picked.length === 0) return;
    if (showNewChat === "add" && active) {
      await fetch(`/api/app/chat/channels/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMemberIds: picked }),
      }).catch(() => {});
      setShowNewChat(false);
      setPicked([]);
      await refresh(active.id);
      return;
    }
    const res = await fetch("/api/app/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: picked, name: picked.length > 1 ? groupName : undefined }),
    });
    const data = await res.json().catch(() => null);
    setShowNewChat(false);
    setPicked([]);
    setGroupName("");
    if (res.ok && data?.id) {
      await openChannel(data.id);
      setMobileOpen(true);
    }
  }

  async function renameGroup() {
    setMenuOpen(false);
    if (!active || active.kind !== "group") return;
    const name = prompt("Group name:", active.name);
    if (name === null) return;
    await fetch(`/api/app/chat/channels/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    await refresh(active.id);
  }

  async function leaveGroup() {
    setMenuOpen(false);
    if (!active || active.kind !== "group") return;
    if (!confirm(`Leave "${active.name}"?`)) return;
    await fetch(`/api/app/chat/channels/${active.id}`, { method: "DELETE" }).catch(() => {});
    setMobileOpen(false);
    await openChannel(everyoneId);
    setMobileOpen(false);
  }

  const typerNames = typers
    .map((id) => memberById.get(id)?.name.split(" ")[0])
    .filter(Boolean) as string[];

  // ── pieces ──────────────────────────────────────────────────────────────────

  const threadList = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-3">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Chats</h1>
        <button
          type="button"
          onClick={() => {
            setPicked([]);
            setGroupName("");
            setShowNewChat("create");
          }}
          className="flex items-center gap-1.5 rounded-full bg-green-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
        >
          <Plus size={15} />
          New chat
        </button>
      </div>
      <div className="card-ledger min-h-0 flex-1 overflow-y-auto">
        {channels.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openChannel(c.id)}
            className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-gray-100 ${
              i < channels.length - 1 ? "border-b border-gray-50" : ""
            } ${c.id === activeId ? "lg:bg-green-50/60" : "hover:bg-gray-50"}`}
          >
            <ChannelIcon channel={c} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[15px] ${c.unread ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>
                  {c.name}
                </span>
                {c.lastMessage && (
                  <span className={`shrink-0 text-[11px] ${c.unread ? "font-semibold text-green-600" : "text-gray-400"}`}>
                    {listTime(c.lastMessage.at)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className={`truncate text-[13px] ${c.unread ? "font-medium text-gray-700" : "text-gray-400"}`}>
                  {c.lastMessage
                    ? c.lastMessage.deleted
                      ? "Message deleted"
                      : `${c.lastMessage.userName === memberById.get(meId)?.name ? "You" : c.lastMessage.userName.split(" ")[0]}: ${c.lastMessage.body}`
                    : c.kind === "everyone"
                      ? "The whole team is here"
                      : "Say hi 👋"}
                </span>
                {c.unread > 0 && (
                  <span className="min-w-[20px] shrink-0 rounded-full bg-green-500 px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const conversation = (
    <div className="flex h-full min-h-0 flex-col bg-white lg:rounded-[8px] lg:border lg:border-gray-200 lg:shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 lg:px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 lg:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft size={20} />
        </button>
        {active && <ChannelIcon channel={active} size={34} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-gray-900">{active?.name}</p>
          <p className="truncate text-[11px] text-gray-400">
            {active?.kind === "everyone"
              ? `${active.memberCount} members · the whole team`
              : active?.kind === "group"
                ? `${active.memberCount} members · ${active.memberIds
                    .filter((id) => id !== meId)
                    .map((id) => memberById.get(id)?.name.split(" ")[0])
                    .filter(Boolean)
                    .slice(0, 4)
                    .join(", ")}`
                : typers.length > 0
                  ? "typing…"
                  : "Only you two can see this"}
          </p>
        </div>
        {activePeer?.phone && (
          <a
            href={telHref(activePeer.phone)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-green-600 transition-colors hover:bg-green-50 active:bg-green-100"
            aria-label={`Call ${activePeer.name}`}
          >
            <Phone size={18} />
          </a>
        )}
        {active?.kind === "group" && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-100"
              aria-label="Group options"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                <button type="button" onClick={renameGroup} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Pencil size={14} /> Rename group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPicked([]);
                    setShowNewChat("add");
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Plus size={14} /> Add people
                </button>
                <button type="button" onClick={leaveGroup} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50">
                  <X size={14} /> Leave group
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3 lg:px-4">
        {loadingThread && (
          <p className="py-10 text-center text-sm text-gray-400">
            <Loader2 size={16} className="mr-1.5 inline animate-spin" />
            Loading…
          </p>
        )}
        {!loadingThread && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">
            No messages yet — start the conversation.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const mine = m.userId === meId;
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
          const firstOfRun = newDay || !prev || prev.userId !== m.userId;
          const lastOfRun = !next || next.userId !== m.userId || dayLabel(next.createdAt) !== dayLabel(m.createdAt);
          const showMeta = active?.kind !== "dm" && !mine;
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
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${firstOfRun ? "mt-2.5" : "mt-0.5"} ${reactionGroups.length > 0 ? "mb-3.5" : ""}`}>
                <div className={`flex max-w-[82%] items-end gap-1.5 lg:max-w-[70%] ${mine ? "flex-row-reverse" : ""}`}>
                  {showMeta && (
                    <span className="w-[26px] shrink-0 self-end pb-0.5">
                      {lastOfRun && <Avatar name={m.userName} size={26} />}
                    </span>
                  )}
                  <div className="relative">
                    {firstOfRun && showMeta && !m.deletedAt && (
                      <p className="mb-0.5 ml-2.5 text-[11px] font-semibold" style={{ color: nameColor(m.userId) }}>
                        {m.userName.split(" ")[0]}
                      </p>
                    )}

                    {m.deletedAt ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 px-3.5 py-2 text-[13px] italic text-gray-400">
                        {mine ? "You deleted this message" : "This message was deleted"}
                      </div>
                    ) : editingId === m.id ? (
                      <div className="w-64">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={2}
                          maxLength={4000}
                          autoFocus
                          className="w-full resize-y rounded-2xl border border-gray-300 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <div className="mt-1 flex justify-end gap-1.5">
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Cancel edit">
                            <X size={13} />
                          </button>
                          <button type="button" onClick={() => saveEdit(m.id)} className="rounded-full bg-green-500 p-1.5 text-white hover:bg-green-600" aria-label="Save edit">
                            <Check size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        {...pressHandlers(m, mine)}
                        className={`select-none whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug lg:select-text ${
                          mine
                            ? `bg-green-600 text-white ${firstOfRun ? "rounded-2xl rounded-br-md" : lastOfRun ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md"}`
                            : `bg-gray-100 text-gray-900 ${firstOfRun ? "rounded-2xl rounded-bl-md" : lastOfRun ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-l-md"}`
                        }`}
                      >
                        <Linkified text={m.body} />
                        <span className={`ml-2 inline-block translate-y-px text-[10px] ${mine ? "text-white/60" : "text-gray-400"}`}>
                          {m.editedAt ? "edited · " : ""}
                          {timeLabel(m.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* Reaction chips — overlap the bubble corner, iMessage style */}
                    {reactionGroups.length > 0 && (
                      <div className={`absolute -bottom-3 z-10 flex gap-0.5 ${mine ? "left-1" : "right-1"}`}>
                        {reactionGroups.map(([emoji, g]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(m.id, emoji)}
                            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[12px] tabular-nums shadow-sm ring-2 ring-white transition-colors ${
                              g.mine ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
                            }`}
                          >
                            {emoji}
                            {g.count > 1 && <span className="text-[10px] font-semibold text-gray-500">{g.count}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Desktop hover actions */}
                    {editingId !== m.id && !m.deletedAt && (
                      <div
                        className={`absolute top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5 shadow-sm lg:group-hover:flex ${
                          mine ? "left-0 -translate-x-full" : "right-0 translate-x-full"
                        }`}
                      >
                        <button type="button" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)} className="rounded-full p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="React">
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
                            <button type="button" onClick={() => deleteMessage(m.id)} className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Desktop inline tapback picker */}
                    {pickerFor === m.id && !m.deletedAt && (
                      <div className={`absolute -top-11 z-20 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg ${mine ? "right-0" : "left-0"}`}>
                        {TAPBACKS.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => toggleReaction(m.id, emoji)} className="rounded-full p-1 text-base transition-transform hover:scale-125">
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

        {/* Typing indicator — iMessage dots */}
        {typerNames.length > 0 && (
          <div className="mt-2 flex items-end gap-1.5">
            <span className="w-[26px] shrink-0" />
            <div>
              {active?.kind !== "dm" && (
                <p className="mb-0.5 ml-2.5 text-[11px] font-medium text-gray-400">
                  {typerNames.join(", ")}
                </p>
              )}
              <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: `${d * 150}ms`, animationDuration: "1s" }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={send}
        className="shrink-0 border-t border-gray-100 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:px-4"
      >
        {error && <p className="mb-1.5 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoGrow();
              if (e.target.value.trim()) pingTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={active?.kind === "dm" ? `Message ${active.name.split(" ")[0]}…` : `Message ${active?.name ?? "your team"}…`}
            className="max-h-[120px] min-h-[42px] flex-1 resize-none rounded-3xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[15px] focus:border-green-400 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-green-500 text-white transition-all hover:bg-green-600 active:scale-95 active:bg-green-700 disabled:opacity-40"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4 lg:p-6">
      {/* Desktop: list + conversation side by side. Mobile: the list page. */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className={`min-h-0 w-full lg:w-80 lg:shrink-0 ${mobileOpen ? "hidden lg:block" : ""}`}>
          {threadList}
        </div>
        <div className="hidden min-h-0 flex-1 lg:block">{conversation}</div>
      </div>

      {/* Mobile conversation — fixed full-viewport (Atlas-style): the input
          anchors to the bottom of the visual viewport so the keyboard never
          covers it, and the overlay sits above the tab bar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)] lg:hidden">
          {conversation}
        </div>
      )}

      {/* Long-press sheet — iMessage style */}
      {pressed && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setPressed(null)}
          onTouchMove={(e) => e.preventDefault()}
        >
          <div
            className="absolute"
            style={{
              left: pressed.mine ? undefined : Math.max(12, pressed.rect.left),
              right: pressed.mine ? Math.max(12, window.innerWidth - pressed.rect.right) : undefined,
              top: Math.min(Math.max(12, pressed.rect.top - 64), window.innerHeight - 220),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-xl"
              style={{ animation: "tile-in 200ms cubic-bezier(0.22,1,0.36,1) both" }}
            >
              {TAPBACKS.map((emoji, i) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggleReaction(pressed.msg.id, emoji)}
                  className="rounded-full p-1.5 text-[22px] leading-none transition-transform active:scale-125"
                  style={{ animation: `tile-in 250ms cubic-bezier(0.22,1,0.36,1) both`, animationDelay: `${i * 25}ms` }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div
              className="mt-2 w-52 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
              style={{ animation: "tile-in 220ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: "40ms", marginLeft: pressed.mine ? "auto" : undefined }}
            >
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(pressed.msg.body).catch(() => {});
                  setPressed(null);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-[15px] text-gray-800 active:bg-gray-50"
              >
                Copy <Copy size={16} className="text-gray-400" />
              </button>
              {pressed.mine && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(pressed.msg.id);
                      setEditDraft(pressed.msg.body);
                      setPressed(null);
                    }}
                    className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-3 text-[15px] text-gray-800 active:bg-gray-50"
                  >
                    Edit <Pencil size={15} className="text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMessage(pressed.msg.id)}
                    className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-3 text-[15px] text-red-600 active:bg-red-50"
                  >
                    Delete <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New chat / add people sheet */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/40 lg:items-center lg:justify-center"
          onClick={() => setShowNewChat(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-200 lg:hidden" />
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              {showNewChat === "add" ? "Add people" : "New chat"}
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              {showNewChat === "add"
                ? "They'll see the whole conversation."
                : "Pick one person for a direct message, or several for a group."}
            </p>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {roster
                .filter((m) => m.id !== meId)
                .filter((m) => showNewChat !== "add" || !active?.memberIds.includes(m.id))
                .map((m) => {
                  const on = picked.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setPicked((p) => (on ? p.filter((id) => id !== m.id) : [...p, m.id]))
                      }
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        on ? "bg-green-50 ring-1 ring-green-300" : "hover:bg-gray-50 active:bg-gray-100"
                      }`}
                    >
                      <Avatar name={m.name} size={32} />
                      <span className="flex-1 truncate text-[15px] font-medium text-gray-800">{m.name}</span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          on ? "border-green-500 bg-green-500 text-white" : "border-gray-300"
                        }`}
                      >
                        {on && <Check size={12} />}
                      </span>
                    </button>
                  );
                })}
            </div>
            {showNewChat === "create" && picked.length > 1 && (
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={60}
                placeholder="Group name (optional)"
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px] focus:border-green-400 focus:outline-none"
              />
            )}
            <button
              type="button"
              onClick={createChat}
              disabled={picked.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-green-500 py-3 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-40"
            >
              {showNewChat === "add"
                ? `Add ${picked.length || ""}`
                : picked.length > 1
                  ? `Start group chat (${picked.length + 1})`
                  : "Start chat"}
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
