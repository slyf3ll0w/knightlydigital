"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  DollarSign,
  FileText,
  Inbox,
  ListChecks,
  Loader2,
  MessageSquare,
  MessagesSquare,
  PhoneCall,
  Receipt,
  SquareKanban,
  X,
  Zap,
} from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import type { FeedKind } from "@/lib/toast";

/**
 * Recent-activity bottom sheet behind the mobile header bell. Reads the
 * aggregate feed (/api/app/notifications) on each open — the feed is built
 * from live records, so there's nothing server-side to reconcile. Dismissal
 * is per-device: swiping a row right (or Clear all) records it in
 * localStorage and it stops rendering; the underlying record is untouched.
 */

type Item = {
  id: string;
  kind: FeedKind;
  title: string;
  sub: string;
  at: string;
  href: string;
};

// Brand colors only — section hues stay confined to the Create/More tiles.
// Allocation: things that ask for action (requests, bookings, leads) wear
// the SECONDARY accent — the app's action color; money records (payments,
// past-due invoices) wear the PRIMARY — the structural/ledger ink.
const KIND_META: Record<Item["kind"], { icon: typeof Inbox; primary: boolean }> = {
  request: { icon: Inbox, primary: false },
  lead: { icon: SquareKanban, primary: false },
  booking: { icon: CalendarClock, primary: false },
  payment: { icon: DollarSign, primary: true },
  invoice: { icon: Receipt, primary: true },
  quote: { icon: FileText, primary: false },
  message: { icon: MessageSquare, primary: false },
  chat: { icon: MessagesSquare, primary: false },
  call: { icon: PhoneCall, primary: false },
  task: { icon: ListChecks, primary: false },
  automation: { icon: Zap, primary: true },
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Dismissed = { ids: string[]; before: string | null };

function loadDismissed(key: string): Dismissed {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (v && Array.isArray(v.ids)) return { ids: v.ids, before: v.before ?? null };
  } catch {
    // fall through
  }
  return { ids: [], before: null };
}

function saveDismissed(key: string, d: Dismissed) {
  try {
    // Cap the id list — the `before` cutoff makes old ids redundant anyway
    localStorage.setItem(key, JSON.stringify({ ...d, ids: d.ids.slice(-100) }));
  } catch {
    // storage blocked — dismissals just don't persist
  }
}

/** One feed row: tap navigates, swiping right past the threshold dismisses. */
function NotifRow({
  item,
  last,
  onOpen,
  onDismiss,
}: {
  item: Item;
  last: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const touch = useRef<{ x: number; y: number; swiping: boolean } | null>(null);
  const THRESHOLD = 96;

  const meta = KIND_META[item.kind] ?? KIND_META.request;
  const Icon = meta.icon;

  return (
    <div className={`group relative overflow-hidden ${last ? "" : "border-b border-gray-100"}`}>
      {/* The reveal under the sliding row — reads as "swipe to clear" */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 flex items-center pl-4 text-[12px] font-semibold text-gray-400 transition-opacity"
        style={{ opacity: dx > 12 ? Math.min(1, dx / THRESHOLD) : 0 }}
      >
        Clear
      </span>
      <Link
        href={item.href}
        onClick={(e) => {
          if (dx !== 0 || leaving) {
            e.preventDefault();
            return;
          }
          hapticImpact("LIGHT");
          onOpen();
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, swiping: false };
        }}
        onTouchMove={(e) => {
          const s = touch.current;
          if (!s) return;
          const t = e.touches[0];
          const moveX = t.clientX - s.x;
          const moveY = t.clientY - s.y;
          if (!s.swiping) {
            // Claim the gesture only for a clearly horizontal rightward drag
            if (moveX > 10 && Math.abs(moveX) > Math.abs(moveY) * 1.4) s.swiping = true;
            else return;
          }
          setDx(Math.max(0, moveX));
        }}
        onTouchEnd={() => {
          const s = touch.current;
          touch.current = null;
          if (!s?.swiping) return;
          if (dx >= THRESHOLD) {
            hapticImpact("MEDIUM");
            setLeaving(true);
            setDx(window.innerWidth);
            setTimeout(onDismiss, 180);
          } else {
            setDx(0);
          }
        }}
        className={`relative flex items-center gap-3 bg-transparent px-4 py-3 transition-colors active:bg-gray-50 ${
          leaving ? "opacity-0" : ""
        }`}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: touch.current?.swiping
            ? "none"
            : "transform 0.18s ease, opacity 0.18s ease",
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
          style={
            meta.primary
              ? { backgroundColor: "var(--wb-primary)", color: "#FFFFFF" }
              : {
                  backgroundColor: "var(--mobile-accent)",
                  color: "var(--mobile-on-accent)",
                }
          }
        >
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-gray-900">
            {item.title}
          </span>
          {item.sub && (
            // An automation's message is the whole point — show it all
            <span className={`block text-[12.5px] text-gray-500 ${item.kind === "automation" ? "whitespace-pre-line" : "truncate"}`}>{item.sub}</span>
          )}
        </span>
        <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400 transition-opacity lg:group-hover:opacity-0 lg:group-focus-within:opacity-0">{ago(item.at)}</span>
      </Link>
      {/* Desk: rows can't be swiped, so a × shows on hover (and keyboard
          focus) in the time label's place — same dismiss as the swipe. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Clear notification"
        className="absolute right-3 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100 lg:flex"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function NotificationsSheet({
  open,
  onClose,
  userId,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  onClearAll?: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  // A failed fetch is said so, never shown as "all caught up" — the dot
  // stayed lit with nothing behind it and no way to tell why.
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const storageKey = `wb-notifs-dismissed:${userId ?? "shared"}`;

  // Refetch on every open — events arrive constantly and the sheet is cheap
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setError(false);
    fetch("/api/app/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        const all = (d?.items as Item[]) ?? [];
        const dismissed = loadDismissed(storageKey);
        setItems(
          all.filter(
            (it) =>
              !dismissed.ids.includes(it.id) &&
              (!dismissed.before || it.at > dismissed.before)
          )
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, storageKey, attempt]);

  // Escape closes the sheet / the desktop dropdown, like every other dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function dismissOne(id: string) {
    const d = loadDismissed(storageKey);
    saveDismissed(storageKey, { ...d, ids: [...d.ids, id] });
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
  }

  function clearAll() {
    hapticImpact("MEDIUM");
    // The cutoff supersedes every individually-dismissed id
    saveDismissed(storageKey, { ids: [], before: new Date().toISOString() });
    setItems([]);
    onClearAll?.();
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 lg:bg-black/10 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      {/* Phone: bottom sheet. Desktop: the same panel anchored under the
          bell, fading up instead of sliding from the bottom of a monitor. */}
      <div
        className={`sheet-material fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-[transform,opacity] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-[64px] lg:w-[380px] lg:max-h-[70vh] lg:rounded-2xl lg:shadow-xl lg:ring-1 lg:ring-black/5 ${
          open
            ? "lg:translate-y-0"
            : "pointer-events-none translate-y-full opacity-100 lg:translate-y-1.5 lg:opacity-0"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300 lg:hidden" />
        <div className="flex items-baseline justify-between px-5 pb-2.5 pt-3.5">
          <p className="font-display text-[16px] font-bold text-gray-900">Notifications</p>
          {items && items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[13px] font-semibold text-[color:var(--wb-ink)] active:opacity-60"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {items === null && !error && (
            <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Checking what&apos;s new…
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-2.5 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Bell size={20} />
              </span>
              <p className="text-sm font-medium text-gray-600">Couldn&apos;t load your notifications.</p>
              <button
                type="button"
                onClick={() => {
                  hapticImpact("LIGHT");
                  setAttempt((n) => n + 1);
                }}
                className="rounded-full bg-gray-100 px-3.5 py-1.5 text-[13px] font-semibold text-gray-700 active:bg-gray-200"
              >
                Try again
              </button>
            </div>
          )}
          {items?.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Bell size={20} />
              </span>
              <p className="text-sm font-medium text-gray-600">You&apos;re all caught up</p>
              <p className="text-xs text-gray-500">
                Requests, bookings, payments, messages and tasks show up here.
              </p>
            </div>
          )}
          {items && items.length > 0 && (
            <div className="card-tool overflow-hidden">
              {items.map((item, i) => (
                <NotifRow
                  key={item.id}
                  item={item}
                  last={i === items.length - 1}
                  onOpen={onClose}
                  onDismiss={() => dismissOne(item.id)}
                />
              ))}
            </div>
          )}
          {items && items.length > 0 && (
            // Phones only — a desk clears with the × that shows on hover
            <p className="pt-2.5 text-center text-[11px] text-gray-400 lg:hidden">
              Swipe a notification right to clear it
            </p>
          )}
        </div>
      </div>
    </>
  );
}
