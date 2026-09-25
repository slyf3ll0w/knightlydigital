"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, X } from "lucide-react";

/**
 * "Chat with us" on the marketing site. Messages post to
 * /api/public/site-chat and land in the WorkBench team's Messages inbox as
 * a website-chat thread; replies typed there come back here by a fast poll
 * while the panel is open (with the team's typing state). A pagehide
 * beacon tells the team when the visitor leaves. The visitor's signed
 * thread token and name live in localStorage so a return visit reopens the
 * same conversation. After the first message, a visitor who gave no number
 * can add one, with a consent box, so a reply can also reach them by text.
 */

type Msg = { id: string; from: "you" | "team"; body: string; at: string; senderName: string | null };

const STORE = "wb-site-chat";
const POLL_OPEN_MS = 2000;
const POLL_CLOSED_MS = 8000;
const TYPING_PING_MS = 2500;

type Stored = { token: string; name: string; hasPhone: boolean };

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return v.token ? { token: v.token, name: v.name ?? "", hasPhone: Boolean(v.hasPhone) } : null;
  } catch {
    return null;
  }
}

function save(v: Stored | null) {
  try {
    if (v) localStorage.setItem(STORE, JSON.stringify(v));
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode */
  }
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function WBSiteChat() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [text, setText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [teamTyping, setTeamTyping] = useState(false);
  const [askPhone, setAskPhone] = useState(false);
  const [latePhone, setLatePhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingPing = useRef(0);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  useEffect(() => {
    const s = load();
    if (s) {
      setToken(s.token);
      setName(s.name);
      setHasPhone(s.hasPhone);
    }
  }, []);

  const fetchMessages = useCallback(
    async (t: string) => {
      try {
        const res = await fetch(`/api/public/site-chat?token=${encodeURIComponent(t)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Msg[]; teamTyping?: boolean; hasPhone?: boolean };
        setTeamTyping(Boolean(data.teamTyping));
        if (typeof data.hasPhone === "boolean") setHasPhone(data.hasPhone);
        setMessages((prev) => {
          const fresh = data.messages.filter((m) => m.from === "team" && !prev.some((p) => p.id === m.id));
          if (fresh.length && !open) setUnread((u) => u + fresh.length);
          return data.messages;
        });
      } catch {
        /* offline; the next poll tries again */
      }
    },
    [open]
  );

  // Poll for the team's replies and typing while a thread exists. The poll
  // doubles as the presence heartbeat the team sees as "on the website now".
  useEffect(() => {
    if (!token) return;
    void fetchMessages(token);
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchMessages(token);
    }, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => clearInterval(id);
  }, [token, open, fetchMessages]);

  // Leaving the site: tell the team (they get a heads-up if no number was left).
  useEffect(() => {
    const leave = () => {
      const t = tokenRef.current;
      if (!t) return;
      try {
        navigator.sendBeacon("/api/public/site-chat/presence", JSON.stringify({ token: t }));
      } catch {
        /* nothing to do */
      }
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages.length, teamTyping]);

  function pingTyping() {
    const t = tokenRef.current;
    if (!t) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_MS) return;
    lastTypingPing.current = now;
    void fetch("/api/public/site-chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t }),
    }).catch(() => {});
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    if (!token && !name.trim()) {
      setError("Tell us your name first.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/public/site-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body, token, name: name.trim(), phone: phone.trim(), website }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        message?: Msg;
        hasPhone?: boolean;
        error?: string;
      };
      if (!res.ok || !data.message) {
        setError(data.error ?? "That did not go through. Try again in a moment.");
        return;
      }
      const gotPhone = Boolean(data.hasPhone);
      if (data.token && data.token !== token) {
        setToken(data.token);
        save({ token: data.token, name: name.trim(), hasPhone: gotPhone });
      }
      setHasPhone(gotPhone);
      setMessages((prev) => [...prev, data.message!]);
      setText("");
      inputRef.current?.focus();
    } catch {
      setError("That did not go through. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function savePhone() {
    if (!token || savingPhone) return;
    setPhoneError("");
    if (!consent) {
      setPhoneError("Check the box so we're allowed to text you.");
      return;
    }
    setSavingPhone(true);
    try {
      const res = await fetch("/api/public/site-chat/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: latePhone.trim(), consent }),
      });
      const data = (await res.json().catch(() => ({}))) as { hasPhone?: boolean; error?: string };
      if (!res.ok) {
        setPhoneError(data.error ?? "That did not save. Try again.");
        return;
      }
      setHasPhone(true);
      setAskPhone(false);
      const s = load();
      if (s) save({ ...s, hasPhone: true });
    } catch {
      setPhoneError("That did not save. Check your connection and try again.");
    } finally {
      setSavingPhone(false);
    }
  }

  const lastFromYou = messages.length > 0 && messages[messages.length - 1].from === "you";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Chat with us"}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-[#0A1428] pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_12px_32px_-10px_rgba(10,20,40,0.55)] transition-colors hover:bg-[#172647]"
      >
        {open ? <X className="h-5 w-5" strokeWidth={2.25} /> : <MessageCircle className="h-5 w-5 text-[#FF8B33]" strokeWidth={2.25} />}
        <span className="hidden sm:inline">{open ? "Close" : "Chat with us"}</span>
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F86A0A] px-1.5 text-[11px] font-bold">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chat with WorkBench"
          className="fixed bottom-24 right-5 z-40 flex h-[560px] max-h-[calc(100vh-7.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_2px_rgba(10,20,40,0.05),0_24px_64px_-20px_rgba(10,20,40,0.4),0_0_0_1px_rgba(10,20,40,0.08)]"
        >
          <div className="wb-dark flex items-center gap-3 px-4 py-3.5 text-white">
            <Image src="/workbench-icon.png" alt="" width={339} height={296} className="h-9 w-auto" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight">WorkBench</p>
              <p className="text-[12.5px] text-blue-100/80">Sales and support, answered by the people who build it.</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-[#F7F9FC] px-4 py-4">
            {messages.length === 0 && (
              <p className="rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-gray-700 ring-1 ring-inset ring-gray-200">
                Ask about the software, pricing, or whether it fits your trade. A real person reads this. Leave a number and we can text you back.
              </p>
            )}
            {messages.map((m) =>
              m.from === "you" ? (
                <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#0B57D8] px-3.5 py-2 text-white">
                  <p className="whitespace-pre-wrap text-[14px] font-medium">{m.body}</p>
                </div>
              ) : (
                <div key={m.id} className="mr-6">
                  <p className="mb-1 px-1 text-[11px] font-semibold text-gray-500">
                    {m.senderName ?? "WorkBench"} · {timeLabel(m.at)}
                  </p>
                  <div className="w-fit max-w-full rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-[14px] leading-relaxed text-gray-800 ring-1 ring-inset ring-gray-200">
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              )
            )}
            {teamTyping && (
              <div className="mr-6 flex items-center gap-1.5 px-1 text-[12px] text-gray-500">
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                </span>
                Someone at WorkBench is typing
              </div>
            )}
            {token && lastFromYou && !teamTyping && (
              <p className="px-1 text-[11.5px] text-gray-400">
                Sent. Replies show up here{hasPhone ? ", and by text too" : ""}.
              </p>
            )}

            {token && !hasPhone && !askPhone && messages.length > 0 && (
              <button
                type="button"
                onClick={() => setAskPhone(true)}
                className="block w-full rounded-xl border border-dashed border-gray-300 bg-white px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#0B57D8] hover:border-[#0B57D8]"
              >
                Stepping away? Add a number and we can text you our reply.
              </button>
            )}
            {token && !hasPhone && askPhone && (
              <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-gray-200">
                <p className="text-[13px] font-bold text-gray-900">Text me the reply</p>
                <input
                  value={latePhone}
                  onChange={(e) => setLatePhone(e.target.value)}
                  placeholder="(214) 555-0100"
                  inputMode="tel"
                  autoComplete="tel"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-[14px] focus:border-[#0B57D8] focus:outline-none focus:ring-2 focus:ring-[#0B57D8]/20"
                />
                <label className="mt-2 flex items-start gap-2 text-[12px] leading-snug text-gray-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 accent-[#0B57D8]"
                  />
                  <span>
                    WorkBench may text me at this number about this conversation. Message and data rates may apply. Reply STOP to opt out.
                  </span>
                </label>
                {phoneError && <p className="mt-1.5 text-[12px] font-semibold text-red-600">{phoneError}</p>}
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void savePhone()}
                    disabled={savingPhone || !latePhone.trim()}
                    className="wb-pill wb-pill-primary wb-pill-sm !py-2 !text-[13px] disabled:opacity-40"
                  >
                    Save number
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskPhone(false)}
                    className="rounded-full px-3 py-2 text-[13px] font-semibold text-gray-500 hover:text-gray-900"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white p-3">
            {!token && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-[14px] focus:border-[#0B57D8] focus:outline-none focus:ring-2 focus:ring-[#0B57D8]/20"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  inputMode="tel"
                  autoComplete="tel"
                  className="min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-[14px] focus:border-[#0B57D8] focus:outline-none focus:ring-2 focus:ring-[#0B57D8]/20"
                />
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="hidden"
                  aria-hidden
                />
                {phone.trim() && (
                  <p className="col-span-2 text-[11.5px] leading-snug text-gray-500">
                    By leaving a number you agree WorkBench may text you about this conversation. Message and data rates may apply. Reply STOP to opt out.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value.trim()) pingTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Write a message…"
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-gray-300 px-3.5 py-2.5 text-[14px] focus:border-[#0B57D8] focus:outline-none focus:ring-2 focus:ring-[#0B57D8]/20"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !text.trim()}
                aria-label="Send"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#0B57D8] text-white transition-colors hover:bg-[#0A4CBB] disabled:opacity-40"
              >
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </button>
            </div>
            {error && <p className="mt-2 px-1 text-[12.5px] font-semibold text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
