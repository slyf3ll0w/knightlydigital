"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
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
  /** Client-side only: shown before the server has answered. */
  pending?: boolean;
};

// A text or website-chat thread is a live conversation and polls like team
// chat does (2026-09-28: 15 s made texting back and forth feel dead). A
// portal-only thread, where the client answers from their hub or by email,
// polls lazily. The GET is one indexed `after` query, so the fast tick is
// cheap, and it pauses whenever the tab is hidden.
const POLL_MS = 15_000;
const LIVE_POLL_MS = 3_000;
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

export type ThreadChannel =
  | { kind: "sms"; from: string } // texts go out from the business line, replies land here
  | { kind: "portal" } // client portal + email; no text (no line, not registered, no number, or opted out)
  | { kind: "none" }; // nothing reaches them: no phone, no email

export default function TeamThread({
  contactId,
  contactFirstName,
  initialMessages,
  channel,
}: {
  contactId: string;
  contactFirstName: string;
  initialMessages: ThreadMessage[];
  /** How a reply reaches this client right now — the line under the composer. */
  channel?: ThreadChannel;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [clientTyping, setClientTyping] = useState(false);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingPing = useRef(0);
  const mounted = useRef(false);

  // A thread the client started (or continued) from the website chat widget.
  const webChat = messages.some((m) => m.via === "web");
  // Texts in play: replies go out as SMS, or they have texted us before.
  const live = webChat || channel?.kind === "sms" || messages.some((m) => m.via === "sms");

  // The poll's cursor: the newest SERVER row — a pending bubble carries the
  // browser's clock, which could sit ahead of the server's and hide a reply.
  const settled = messages.filter((m) => !m.pending);
  const lastCreatedAt = settled.length ? settled[settled.length - 1].createdAt : null;
  const lastRef = useRef(lastCreatedAt);
  lastRef.current = lastCreatedAt;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: mounted.current ? "smooth" : "auto" });
    mounted.current = true;
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
    if (live) void poll();
    const interval = setInterval(poll, live ? LIVE_POLL_MS : POLL_MS);
    // Coming back to the tab (or the phone waking) catches up at once
    // instead of waiting out the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [contactId, live]);

  // Typing heartbeat, only where someone is listening (the website widget).
  function pingTyping() {
    if (!webChat) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_MS) return;
    lastTypingPing.current = now;
    void fetch(`/api/app/messages/${contactId}/typing`, { method: "POST" }).catch(() => {});
  }

  // Optimistic send: the bubble appears and the box clears the instant the
  // button is pressed; the server row replaces the bubble when it answers,
  // and a failure hands the words back to the box.
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return; // sends may overlap: each has its own bubble
    setError("");
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, direction: "OUTBOUND", body, via: "portal", createdAt: new Date().toISOString(), senderName: null, pending: true },
    ]);
    setDraft("");
    inputRef.current?.focus();
    try {
      const res = await fetch(`/api/app/messages/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
      const saved = data?.message as ThreadMessage | undefined;
      setMessages((prev) => {
        const rest = prev.filter((m) => m.id !== tempId);
        // the poll may have delivered the server row already
        return saved && !rest.some((m) => m.id === saved.id) ? [...rest, saved] : rest;
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft((d) => d || body);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="ds-card p-4 sm:p-5">
      {webChat && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${visitorOnline ? "bg-[color:var(--ds-good)]" : "bg-gray-300"}`}
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
          body={
            channel?.kind === "sms"
              ? `Your first message texts ${contactFirstName} from ${channel.from}. Their reply lands right here.`
              : channel?.kind === "none"
                ? `${contactFirstName} has no phone or email on file — add one so a message can reach them.`
                : `Anything you send reaches ${contactFirstName} in their client portal — plus an email so they see it fast.`
          }
        />
      ) : (
        <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
          {messages.map((m) => {
            const mine = m.direction === "OUTBOUND";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[min(75%,30rem)] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left transition-opacity ${
                      mine ? "bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]" : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-ink)]"
                    } ${m.pending ? "opacity-60" : ""}`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {m.body}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {m.pending
                      ? "Sending…"
                      : mine
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
          ref={inputRef}
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
          disabled={!draft.trim()}
          aria-label="Send message"
          className="shrink-0 rounded-[10px] p-2.5 bg-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-strong)] active:bg-[color:var(--ds-primary-strong)] text-[color:var(--ds-on-primary)] transition-colors disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
      {channel && !error && (
        <p className="mt-2 text-[11px] text-gray-500">
          {channel.kind === "sms"
            ? `Texts ${contactFirstName} from ${channel.from} · replies land here`
            : channel.kind === "none"
              ? `No phone or email on file for ${contactFirstName}`
              : `Reaches ${contactFirstName} in their client portal and by email`}
        </p>
      )}
    </div>
  );
}
