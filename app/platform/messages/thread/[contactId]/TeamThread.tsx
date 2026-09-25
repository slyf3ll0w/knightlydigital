"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import EmptyState from "@/components/EmptyState";

/**
 * Team side of a portal thread. Mirror image of the hub component: company
 * messages (OUTBOUND) sit right, the client's sit left. Polls while open so
 * a client replying from their hub shows up without a refresh.
 */

type ThreadMessage = {
  id: string;
  direction: string; // INBOUND = from the client, OUTBOUND = from the team
  body: string;
  via: string;
  createdAt: string;
  senderName: string | null;
};

// Portal/SMS threads poll lazily; a website-chat thread is a live
// conversation, so it polls like team chat does.
const POLL_MS = 15_000;
const WEB_POLL_MS = 3_000;
const TYPING_PING_MS = 2_500;

function prettyPhone(e164: string): string {
  const d = e164.replace(/D/g, "").replace(/^1(?=d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TeamThread({
  contactId,
  contactFirstName,
  initialMessages,
}: {
  contactId: string;
  contactFirstName: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [clientTyping, setClientTyping] = useState(false);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTypingPing = useRef(0);

  // A thread the client started (or continued) from the website chat widget.
  const webChat = messages.some((m) => m.via === "web");

  const lastCreatedAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const lastRef = useRef(lastCreatedAt);
  lastRef.current = lastCreatedAt;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  // The server page marks this thread's inbound messages read as it renders
  // — recount the nav badges on mount so the Messages dot clears right away
  // instead of after the next navigation past the shell's throttle.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wb:nav-counts"));
  }, [contactId]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const after = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
        const res = await fetch(`/api/app/messages/${contactId}${after}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: ThreadMessage[];
          clientTyping?: boolean;
          visitorOnline?: boolean;
          contactPhone?: string | null;
        };
        if (stopped) return;
        setClientTyping(Boolean(data.clientTyping));
        if (typeof data.visitorOnline === "boolean") setVisitorOnline(data.visitorOnline);
        if (data.contactPhone !== undefined) setContactPhone(data.contactPhone);
        if (!data.messages?.length) return;
        // Opening the thread marks its inbound messages read server-side —
        // recount the nav badges so the Messages dot clears right away.
        if (data.messages.some((m) => m.direction === "INBOUND")) {
          window.dispatchEvent(new CustomEvent("wb:nav-counts"));
        }
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        /* transient — next tick retries */
      }
    };
    if (webChat) void poll();
    const interval = setInterval(poll, webChat ? WEB_POLL_MS : POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [contactId, webChat]);

  // Typing heartbeat, only where someone is listening (the website widget).
  function pingTyping() {
    if (!webChat) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_MS) return;
    lastTypingPing.current = now;
    void fetch(`/api/app/messages/${contactId}/typing`, { method: "POST" }).catch(() => {});
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/app/messages/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data?.message) setMessages((prev) => [...prev, data.message as ThreadMessage]);
      setDraft("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-ledger p-4 sm:p-5">
      {webChat && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${visitorOnline ? "bg-green-500" : "bg-gray-300"}`}
              aria-hidden
            />
            {visitorOnline === null
              ? "Website chat"
              : visitorOnline
                ? `${contactFirstName} is on the website now`
                : `${contactFirstName} left the website`}
          </span>
          {contactPhone !== undefined && (
            <span>
              {contactPhone
                ? `Left a number: ${prettyPhone(contactPhone)}`
                : "No number left, so a reply only reaches them while they're here"}
            </span>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState
          compact
          title="No messages yet"
          body={`Anything you send reaches ${contactFirstName} in their client portal — plus a text or email so they see it fast.`}
        />
      ) : (
        <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
          {messages.map((m) => {
            const mine = m.direction === "OUTBOUND";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[min(75%,30rem)] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left ${
                      mine ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {m.body}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {mine
                      ? `${m.senderName || "You"} · ${timeLabel(m.createdAt)}`
                      : `${contactFirstName}${m.via === "sms" ? " (by text)" : m.via === "web" ? " (website chat)" : ""} · ${timeLabel(m.createdAt)}`}
                  </p>
                </div>
              </div>
            );
          })}
          {clientTyping && (
            <p className="px-1 text-[12px] text-gray-500">
              <span className="atlas-shimmer">{contactFirstName} is typing…</span>
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <form onSubmit={handleSend} className="mt-4 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) pingTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          rows={draft.includes("\n") || draft.length > 80 ? 3 : 1}
          maxLength={5000}
          placeholder={`Message ${contactFirstName}…`}
          className="flex-1 resize-none rounded-[10px] border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="shrink-0 rounded-[10px] p-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white transition-colors disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
