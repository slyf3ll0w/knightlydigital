"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, X } from "lucide-react";

/**
 * "Chat with us" on the marketing site. Messages post to
 * /api/public/site-chat and land in the WorkBench team's Messages inbox as
 * a website-chat thread; replies typed there come back here by polling.
 * The visitor's signed thread token and name live in localStorage so a
 * return visit reopens the same conversation.
 */

type Msg = { id: string; from: "you" | "team"; body: string; at: string; senderName: string | null };

const STORE = "wb-site-chat";
const POLL_MS = 8000;

function load(): { token: string; name: string } | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as { token: string; name: string }) : null;
  } catch {
    return null;
  }
}

function save(v: { token: string; name: string } | null) {
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
  const [text, setText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = load();
    if (s) {
      setToken(s.token);
      setName(s.name);
    }
  }, []);

  const fetchMessages = useCallback(
    async (t: string) => {
      try {
        const res = await fetch(`/api/public/site-chat?token=${encodeURIComponent(t)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Msg[] };
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

  // Poll for the team's replies while a thread exists (faster when open).
  useEffect(() => {
    if (!token) return;
    void fetchMessages(token);
    const id = setInterval(() => void fetchMessages(token), open ? POLL_MS : POLL_MS * 4);
    return () => clearInterval(id);
  }, [token, open, fetchMessages]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages.length]);

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
      const data = (await res.json().catch(() => ({}))) as { token?: string; message?: Msg; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? "That did not go through. Try again in a moment.");
        return;
      }
      if (data.token && data.token !== token) {
        setToken(data.token);
        save({ token: data.token, name: name.trim() });
      }
      setMessages((prev) => [...prev, data.message!]);
      setText("");
      inputRef.current?.focus();
    } catch {
      setError("That did not go through. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Chat with us"}
        className="wb-sitechat-launch fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-[#0A1428] pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_12px_32px_-10px_rgba(10,20,40,0.55)] transition-colors hover:bg-[#172647]"
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
            {token && messages.length > 0 && messages[messages.length - 1].from === "you" && (
              <p className="px-1 text-[11.5px] text-gray-400">Sent. Replies show up here, and by text if you left a number.</p>
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
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
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
