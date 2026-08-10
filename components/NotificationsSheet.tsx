"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  DollarSign,
  Inbox,
  Loader2,
  MessageSquare,
  Receipt,
  SquareKanban,
} from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * Recent-activity bottom sheet behind the mobile header bell. Reads the
 * aggregate feed (/api/app/notifications) on each open — the feed is built
 * from live records, so there's nothing server-side to reconcile. Dismissal
 * is per-device: swiping a row right (or Clear all) records it in
 * localStorage and it stops rendering; the underlying record is untouched.
 */

type Item = {
  id: string;
  kind: "request" | "lead" | "booking" | "payment" | "invoice" | "message";
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
  message: { icon: MessageSquare, primary: false },
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
    <div className={`relative overflow-hidden ${last ? "" : "border-b border-gray-100"}`}>
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
            <span className="block truncate text-[12.5px] text-gray-500">{item.sub}</span>
          )}
        </span>
        <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400">{ago(item.at)}</span>
      </Link>
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
  const storageKey = `wb-notifs-dismissed:${userId ?? "shared"}`;

  // Refetch on every open — events arrive constantly and the sheet is cheap
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    fetch("/api/app/notifications")
      .then((r) => (r.ok ? r.json() : null))
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
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, storageKey]);

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
        className={`fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`sheet-material fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] lg:hidden ${
          open ? "" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300" />
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
          {items === null && (
            <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Checking what&apos;s new…
            </div>
          )}
          {items?.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Bell size={20} />
              </span>
              <p className="text-sm font-medium text-gray-600">You&apos;re all caught up</p>
              <p className="text-xs text-gray-400">
                New requests, bookings and payments show up here.
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
            <p className="pt-2.5 text-center text-[11px] text-gray-400">
              Swipe a notification right to clear it
            </p>
          )}
        </div>
      </div>
    </>
  );
}
