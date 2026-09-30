"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Phone, RotateCcw, SendHorizonal } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import CallLink from "@/components/CallLink";
import { hapticImpact } from "@/lib/haptics";
import { useMeasuredHeight } from "@/lib/use-measured-height";

/**
 * Team side of a client thread — built to feel exactly like Team Chat
 * (2026-09-29, David: "make that much smoother like the Team Chat"):
 *
 * - Phones: a fixed full-viewport conversation (Atlas-style) sized to the
 *   visual viewport, so the keyboard never covers the composer and the tab
 *   bar never covers anything. Desktop: a full-height pane.
 * - The message pane is the ONLY scroller (the page never jumps); it stays
 *   pinned to the newest message unless you scrolled up to read.
 * - Bubbles group into runs, days get a pill, new arrivals spring in, the
 *   composer grows with the draft, a failed send stays put with tap-to-retry.
 * - Polls every 3 s while a text / website conversation is live, 6 s for a
 *   portal thread; the GET is one indexed `after` query.
 */

export type ThreadMessage = {
  id: string;
  direction: string; // INBOUND = from the client, OUTBOUND = from the team
  body: string;
  via: string;
  createdAt: string;
  senderName: string | null;
  /** Client-side only: shown before the server has answered. */
  pending?: boolean;
  /** Client-side only: the POST failed — the bubble stays with a retry. */
  failed?: boolean;
};

export type ThreadChannel =
  | { kind: "sms"; from: string } // texts go out from the business line, replies land here
  | { kind: "portal" } // client portal + email; no text (no line, not registered, no number, or opted out)
  | { kind: "none" }; // nothing reaches them: no phone, no email

const LIVE_POLL_MS = 3_000;
const POLL_MS = 6_000;
const TYPING_PING_MS = 2_500;

function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

// Clock labels are computed in the COMPANY's timezone on both the server and
// the client, so hydration agrees on where the day pills fall (a UTC server
// and a Central phone used to disagree for anything sent after 7 PM).
function dayKey(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
}

function dayLabel(iso: string, tz: string): string {
  const key = dayKey(iso, tz);
  const now = Date.now();
  if (key === dayKey(new Date(now).toISOString(), tz)) return "Today";
  if (key === dayKey(new Date(now - 86400000).toISOString(), tz)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
}

function timeLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
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

export default function TeamThread({
  contactId,
  contactName,
  contactFirstName,
  companyName,
  phone,
  initialMessages,
  channel,
  banner,
  tz,
}: {
  contactId: string;
  /** Full display name (the header). */
  contactName: string;
  /** What the copy calls them ("them" for a not-yet-saved number). */
  contactFirstName: string;
  companyName?: string | null;
  /** Their phone, for the Call button. */
  phone?: string | null;
  initialMessages: ThreadMessage[];
  /** How a reply reaches this client right now — the line under their name. */
  channel?: ThreadChannel;
  /** Something to show above the first message (the Save-contact card). */
  banner?: ReactNode;
  /** The company's timezone — every clock label on the thread. */
  tz: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [clientTyping, setClientTyping] = useState(false);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null | undefined>(undefined);
  // iOS keyboard: the layout viewport doesn't shrink, only the visual one —
  // size the conversation to the visual viewport so the composer AND the
  // latest messages stay above the keyboard.
  const [vvBox, setVvBox] = useState<{ top: number; height: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Phones: the composer floats over the thread, so the list pads its
  // bottom by the composer's live height (it grows with the draft).
  const [composerRef, composerH] = useMeasuredHeight();
  const stickToBottomRef = useRef(true);
  // First pin jumps; later arrivals glide (iMessage)
  const instantPinRef = useRef(true);
  // Ids already on screen — only messages that arrive later spring in
  const seenRef = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const lastTypingPing = useRef(0);

  // A thread the client started (or continued) from the website chat widget.
  const webChat = messages.some((m) => m.via === "web");
  // Texts in play: replies go out as SMS, or they have texted us before.
  const live = webChat || channel?.kind === "sms" || messages.some((m) => m.via === "sms");

  // The poll's cursor: the newest SERVER row — a pending bubble carries the
  // browser's clock, which could sit ahead of the server's and hide a reply.
  const lastRef = useRef<string | null>(null);
  {
    let last: string | null = null;
    for (const m of messages) if (!m.pending && !m.failed) last = m.createdAt;
    lastRef.current = last;
  }

  // The server page marks this thread's inbound messages read as it renders
  // — recount the nav badges on mount so the Messages dot clears right away.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wb:nav-counts"));
  }, [contactId]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    if (instantPinRef.current) {
      el.scrollTop = el.scrollHeight;
      instantPinRef.current = false;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, clientTyping]);

  const pinToBottom = useCallback(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Track the visual viewport on phones: when the keyboard takes space,
  // shrink the conversation to what's actually visible and re-pin.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboardUp = window.innerHeight - vv.height > 80;
      setVvBox(keyboardUp ? { top: vv.offsetTop, height: vv.height } : null);
      pinToBottom();
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setVvBox(null);
    };
  }, [pinToBottom]);

  useEffect(() => {
    let stopped = false;
    let inflight = false;
    const poll = async () => {
      if (stopped || inflight || document.visibilityState !== "visible") return;
      inflight = true;
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
        // The poll marks inbound messages read server-side — recount the nav
        // badges so the Messages dot clears right away.
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
      } finally {
        inflight = false;
      }
    };
    void poll();
    const interval = setInterval(poll, live ? LIVE_POLL_MS : POLL_MS);
    // Coming back to the tab (or the phone waking) catches up at once.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [contactId, live]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // Typing heartbeat, only where someone is listening (the website widget).
  function pingTyping() {
    if (!webChat) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_MS) return;
    lastTypingPing.current = now;
    void fetch(`/api/app/messages/${contactId}/typing`, { method: "POST" }).catch(() => {});
  }

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  // Optimistic send: the bubble appears the moment you hit send, the POST
  // settles in the background. Failure marks the bubble "not delivered" with
  // a tap-to-retry instead of blocking the composer.
  async function postMessage(body: string) {
    const temp: ThreadMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      direction: "OUTBOUND",
      body,
      via: "portal",
      createdAt: new Date().toISOString(),
      senderName: null,
      pending: true,
    };
    seenRef.current.add(temp.id);
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, temp]);
    try {
      const res = await fetch(`/api/app/messages/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      const saved = data?.message as ThreadMessage | undefined;
      if (!res.ok || !saved) throw new Error(data?.error ?? "Not delivered.");
      seenRef.current.add(saved.id);
      setMessages((prev) =>
        prev.some((m) => m.id === saved.id)
          ? prev.filter((m) => m.id !== temp.id) // the poll delivered the server row already
          : prev.map((m) => (m.id === temp.id ? saved : m))
      );
    } catch (err) {
      setError(err instanceof Error && err.message !== "Not delivered." ? err.message : "");
      setMessages((prev) =>
        prev.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m))
      );
    }
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError("");
    setDraft("");
    requestAnimationFrame(autoGrow);
    hapticImpact("LIGHT");
    void postMessage(body);
  }

  function retrySend(m: ThreadMessage) {
    setError("");
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    void postMessage(m.body);
  }

  // Header line under the name: what's happening, else how a reply reaches them.
  const status = clientTyping
    ? "typing…"
    : webChat && visitorOnline !== null
      ? visitorOnline
        ? `On your website now${contactPhone ? ` · ${prettyPhone(contactPhone)}` : ""}`
        : contactPhone
          ? `Left the website · ${prettyPhone(contactPhone)}`
          : "Left the website · no number left, replies reach them only while they're here"
      : channel?.kind === "sms"
        ? `Texts from ${channel.from} · replies land here`
        : channel?.kind === "none"
          ? "No phone or email on file"
          : "Client portal + email";

  // Outbound bubbles name the sender only when more than one team member has written here.
  const senders = new Set(messages.filter((m) => m.direction === "OUTBOUND" && m.senderName).map((m) => m.senderName));
  const nameSenders = senders.size > 1;

  const emptyBody =
    channel?.kind === "sms"
      ? `Your first message texts ${contactFirstName} from ${channel.from}. Their reply lands right here.`
      : channel?.kind === "none"
        ? `${contactFirstName} has no phone or email on file — add one so a message can reach them.`
        : `Anything you send reaches ${contactFirstName} in their client portal — plus an email so they see it fast.`;

  return (
    // Phones: a fixed full-viewport conversation above the shell (tab bar
    // included), sized to the visual viewport while the keyboard is up.
    // Desktop: fills the page's height. data-ptr-ignore keeps the shell's
    // pull-to-refresh off the thread.
    <div
      data-ptr-ignore
      className={`h-full min-h-0 max-lg:fixed max-lg:inset-x-0 max-lg:z-[60] max-lg:bg-[color:var(--t-surface,#fff)] ${
        vvBox ? "" : "max-lg:top-0 max-lg:h-[100dvh] max-lg:pt-[env(safe-area-inset-top)]"
      }`}
      style={vvBox ? { top: vvBox.top, height: vvBox.height } : undefined}
    >
      <div className="relative flex h-full min-h-0 flex-col bg-white lg:rounded-[8px] lg:border lg:border-gray-200 lg:shadow-sm">
        {/* Header — floats over the thread on phones (.chat-head) */}
        <div className="chat-head glass-bar flex shrink-0 items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 lg:px-4">
          <Link
            prefetch={false}
            href="/app/messages"
            onClick={() => hapticImpact("LIGHT")}
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-100"
            aria-label="Back to messages"
          >
            <ArrowLeft size={20} />
          </Link>
          <Link prefetch={false} href={`/app/contacts/${contactId}`} className="shrink-0" aria-label={`Open ${contactName}`}>
            <Monogram name={contactName} size={34} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              prefetch={false}
              href={`/app/contacts/${contactId}`}
              className="block truncate text-[15px] font-semibold text-gray-900 hover:underline"
            >
              {contactName}
              {companyName ? <span className="font-normal text-gray-500"> · {companyName}</span> : null}
            </Link>
            <p className={`truncate text-[11px] ${clientTyping ? "text-[color:var(--ds-primary)]" : "text-gray-400"}`}>
              {status}
            </p>
          </div>
          {phone && (
            <CallLink
              phone={phone}
              contactId={contactId}
              name={contactName}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--ds-primary)] transition-colors hover:bg-[color:var(--ds-primary-soft)] active:bg-[color:var(--ds-primary-soft)] disabled:opacity-60"
              aria-label={`Call ${contactName}`}
            >
              <Phone size={18} />
            </CallLink>
          )}
        </div>

        {/* Messages — the one scroller */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="chat-body composer-pad min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain px-3 py-3 lg:px-4"
          style={{ "--composer-h": `${composerH}px` } as React.CSSProperties}
        >
          {banner && <div className="mb-3">{banner}</div>}
          {messages.length === 0 && <EmptyState compact title="No messages yet" body={emptyBody} />}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const mine = m.direction === "OUTBOUND";
            const newDay = !prev || dayKey(prev.createdAt, tz) !== dayKey(m.createdAt, tz);
            const firstOfRun = newDay || !prev || prev.direction !== m.direction;
            const lastOfRun = !next || next.direction !== m.direction || dayKey(next.createdAt, tz) !== dayKey(m.createdAt, tz);
            // Spring-in for messages that appear while the thread is on screen
            const entering = !seenRef.current.has(m.id) && Date.now() - new Date(m.createdAt).getTime() < 10_000;
            seenRef.current.add(m.id);
            const viaTag = !mine && m.via === "sms" ? "Text · " : !mine && m.via === "web" ? "Web · " : "";
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-500">
                      {dayLabel(m.createdAt, tz)}
                    </span>
                  </div>
                )}
                <div className={`flex ${entering ? "msg-enter" : ""} ${mine ? "justify-end" : "justify-start"} ${firstOfRun ? "mt-2.5" : "mt-0.5"}`}>
                  <div className="max-w-[82%] lg:max-w-[min(70%,30rem)]">
                    {mine && firstOfRun && nameSenders && m.senderName && (
                      <p className="mb-0.5 mr-2.5 text-right text-[11px] font-semibold text-gray-400">
                        {m.senderName.split(" ")[0]}
                      </p>
                    )}
                    <div
                      className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug ${m.pending ? "opacity-60" : ""} ${
                        mine
                          ? `bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)] ${firstOfRun ? "rounded-2xl rounded-br-md" : lastOfRun ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md"}`
                          : `bg-gray-100 text-gray-900 ${firstOfRun ? "rounded-2xl rounded-bl-md" : lastOfRun ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-l-md"}`
                      }`}
                    >
                      <Linkified text={m.body} />
                      <span className={`ml-2 inline-block translate-y-px text-[10px] ${mine ? "text-white/60" : "text-gray-400"}`}>
                        {m.pending ? "Sending…" : `${viaTag}${timeLabel(m.createdAt, tz)}`}
                      </span>
                    </div>
                    {m.failed && (
                      <button
                        type="button"
                        onClick={() => retrySend(m)}
                        className="mt-0.5 flex w-full items-center justify-end gap-1 text-[11px] font-medium text-[color:var(--ds-bad)]"
                      >
                        <RotateCcw size={11} /> Not delivered — tap to retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator — iMessage dots (website chat only) */}
          {clientTyping && (
            <div className="mt-2 flex items-end">
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
          )}
        </div>

        {/* Composer — on phones a glass capsule floating over the last
            messages (.chat-composer pins it to the bottom; the list pads for
            it); on desktop the plain bar under the thread. */}
        <form
          ref={composerRef}
          onSubmit={send}
          className="chat-composer shrink-0 border-t border-gray-100 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:px-4"
        >
          {error && <p className="mb-1.5 text-xs text-[color:var(--ds-bad)]">{error}</p>}
          <div className="glass-control flex items-end gap-2 max-lg:rounded-[27px] max-lg:p-1.5 max-lg:pl-1">
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
              onFocus={() => {
                // the keyboard animates in — pin again once it has settled
                setTimeout(pinToBottom, 350);
              }}
              rows={1}
              maxLength={5000}
              disabled={channel?.kind === "none"}
              placeholder={channel?.kind === "none" ? "Add a phone or email first" : `Message ${contactFirstName}…`}
              className="max-h-[120px] min-h-[42px] flex-1 resize-none rounded-3xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[15px] focus:border-[color:var(--ds-primary)] focus:bg-white focus:outline-none disabled:opacity-60 max-lg:px-3.5"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)] transition-all hover:bg-[color:var(--ds-primary-strong)] active:scale-95 active:bg-[color:var(--ds-primary-strong)] disabled:opacity-40 max-lg:shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
            >
              <SendHorizonal size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
