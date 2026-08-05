"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Loader2, MessageSquare, Send, Share, SquarePlus, X } from "lucide-react";
import { textOn } from "@/lib/branding";

/**
 * The client's side of the portal message thread. Their own messages sit
 * right in the company's brand color; company replies sit left in gray.
 * Polls for new replies while the tab is open, and carries the two PWA
 * nudges (turn on notifications / add to home screen) — messaging is the
 * reason a client would want either.
 */

export type ThreadMessage = {
  id: string;
  direction: string; // INBOUND = from the client ("you"), OUTBOUND = from the company
  body: string;
  via: string;
  createdAt: string;
  senderName: string | null;
};

const POLL_MS = 20_000;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true);

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

/* ── Notifications + install nudge ─────────────────────────────────────────── */

type PushState = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";
const HINT_KEY = "hub-pwa-hint-dismissed";

function PwaNudge({ token, companyName }: { token: string; companyName: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(HINT_KEY) === "1");
    } catch {}
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const keyRes = await fetch("/api/hub/push");
        const key: string | null = keyRes.ok ? (await keyRes.json()).publicKey : null;
        if (cancelled) return;
        if (!key) return setState("unconfigured");
        if (Notification.permission === "denied") return setState("denied");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          // Re-sync so a pruned server row comes back on the next visit
          await fetch("/api/hub/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, subscription: sub.toJSON() }),
          });
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const keyRes = await fetch("/api/hub/push");
      const key: string | null = keyRes.ok ? (await keyRes.json()).publicKey : null;
      if (!key) return setState("unconfigured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        }));
      const res = await fetch("/api/hub/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, subscription: sub.toJSON() }),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const hide = () => {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  if (dismissed) return null;

  // iOS outside the installed app: push only works from the Home Screen app,
  // so the useful nudge is the install steps, not a dead notifications button.
  if (isIos() && !isStandalone()) {
    return (
      <div className="card-ledger p-4 mb-4 flex items-start gap-3">
        <SquarePlus size={18} className="text-gray-400 shrink-0 mt-0.5" />
        <p className="flex-1 text-[13px] leading-relaxed text-gray-600">
          Get notified when {companyName} replies: tap{" "}
          <Share size={13} className="inline -mt-0.5 text-gray-500" aria-label="Share" /> in
          Safari, choose <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>, then turn
          on notifications from the installed app.
        </p>
        <button onClick={hide} aria-label="Dismiss" className="p-1 text-gray-400 hover:text-gray-600">
          <X size={15} />
        </button>
      </div>
    );
  }

  if (state === "on") {
    return (
      <p className="mb-4 text-xs text-green-700 flex items-center gap-1.5">
        <BellRing size={12} /> You&apos;ll get a notification on this device when {companyName} replies.
      </p>
    );
  }
  if (state !== "off" && !installEvent) return null;

  return (
    <div className="card-ledger p-4 mb-4 flex flex-wrap items-center gap-3">
      <Bell size={18} className="text-gray-400 shrink-0" />
      <p className="flex-1 min-w-48 text-[13px] text-gray-600">
        Know the moment {companyName} replies.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {state === "off" && (
          <button
            onClick={enable}
            disabled={busy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold rounded-[10px] transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
            Turn on notifications
          </button>
        )}
        {installEvent && (
          <button
            onClick={() => {
              (installEvent as { prompt?: () => void }).prompt?.();
              setInstallEvent(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-[13px] font-semibold rounded-[10px] transition-colors"
          >
            <SquarePlus size={13} />
            Install app
          </button>
        )}
        <button onClick={hide} aria-label="Dismiss" className="p-1 text-gray-400 hover:text-gray-600">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/* ── The thread ────────────────────────────────────────────────────────────── */

export default function HubMessagesThread({
  token,
  companyName,
  accent,
  initialMessages,
}: {
  token: string;
  companyName: string;
  accent: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const accentText = textOn(accent);

  const lastCreatedAt = messages.length ? messages[messages.length - 1].createdAt : null;
  const lastRef = useRef(lastCreatedAt);
  lastRef.current = lastCreatedAt;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  // Poll for replies while the tab is visible; also on refocus
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const after = lastRef.current ? `&after=${encodeURIComponent(lastRef.current)}` : "";
        const res = await fetch(`/api/hub/messages?token=${encodeURIComponent(token)}${after}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ThreadMessage[] };
        if (stopped || !data.messages?.length) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        /* offline / transient — next tick retries */
      }
    };
    const interval = setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [token]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/hub/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, body }),
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
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Messages</h2>

      <PwaNudge token={token} companyName={companyName} />

      <div className="card-ledger p-4 sm:p-5">
        {messages.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No messages yet — questions about a quote, a visit, or anything
              else? Send {companyName} a message below.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
            {messages.map((m) => {
              const mine = m.direction === "INBOUND";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-2xl px-3.5 py-2 text-left ${
                        mine ? "" : "bg-gray-100"
                      }`}
                      style={mine ? { background: accent, color: accentText } : undefined}
                    >
                      <p
                        className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          mine ? "" : "text-gray-900"
                        }`}
                      >
                        {m.body}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {mine
                        ? m.via === "sms"
                          ? `You (by text) · ${timeLabel(m.createdAt)}`
                          : `You · ${timeLabel(m.createdAt)}`
                        : `${m.senderName || companyName} · ${timeLabel(m.createdAt)}`}
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
            placeholder={`Message ${companyName}…`}
            className="flex-1 resize-none rounded-[10px] border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="shrink-0 rounded-[10px] p-2.5 transition-opacity disabled:opacity-40"
            style={{ background: accent, color: accentText }}
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-[11px] text-gray-400">
          We&apos;ll reply here — and by text or email so you don&apos;t miss it.
        </p>
      </div>
    </div>
  );
}
