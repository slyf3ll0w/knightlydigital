"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";

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

const POLL_MS = 15_000;

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
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastCreatedAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const lastRef = useRef(lastCreatedAt);
  lastRef.current = lastCreatedAt;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const after = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
        const res = await fetch(`/api/app/messages/${contactId}${after}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ThreadMessage[] };
        if (stopped || !data.messages?.length) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        /* transient — next tick retries */
      }
    };
    const interval = setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [contactId]);

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
      {messages.length === 0 ? (
        <div className="py-10 text-center">
          <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No messages yet. Anything you send reaches {contactFirstName} in
            their client portal — plus a text or email so they see it fast.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
          {messages.map((m) => {
            const mine = m.direction === "OUTBOUND";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "text-right" : ""}`}>
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
                      : `${contactFirstName}${m.via === "sms" ? " (by text)" : ""} · ${timeLabel(m.createdAt)}`}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <form onSubmit={handleSend} className="mt-4 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
