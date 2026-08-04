"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarClock,
  DollarSign,
  Inbox,
  Loader2,
  Receipt,
  SquareKanban,
} from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * Recent-activity bottom sheet behind the mobile header bell. Reads the
 * aggregate feed (/api/app/notifications) on each open — the feed is built
 * from live records, so there's no read/unread state to reconcile; the bell
 * dot upstream keys off the nav badge counts.
 */

type Item = {
  id: string;
  kind: "request" | "lead" | "booking" | "payment" | "invoice";
  title: string;
  sub: string;
  at: string;
  href: string;
};

// Same entity → hue mapping as the Create/More sheets (tenant-repaintable
// via the --sh-* vars), so the feed scans by color like the rest of the nav.
const KIND_META: Record<Item["kind"], { icon: typeof Inbox; hue: string }> = {
  request: { icon: Inbox, hue: "requests" },
  lead: { icon: SquareKanban, hue: "leads" },
  booking: { icon: CalendarClock, hue: "schedule" },
  payment: { icon: DollarSign, hue: "payments" },
  invoice: { icon: Receipt, hue: "invoices" },
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

export default function NotificationsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);

  // Refetch on every open — events arrive constantly and the sheet is cheap
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    fetch("/api/app/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setItems((d?.items as Item[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        <p className="font-display px-5 pb-2.5 pt-3.5 text-[16px] font-bold text-gray-900">
          Notifications
        </p>
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
              {items.map((item, i) => {
                const meta = KIND_META[item.kind] ?? KIND_META.request;
                const Icon = meta.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => {
                      hapticImpact("LIGHT");
                      onClose();
                    }}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-50 ${
                      i < items.length - 1 ? "border-b border-gray-100" : ""
                    }`}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                      style={{
                        backgroundColor: `var(--sh-${meta.hue})`,
                        color: `var(--sh-${meta.hue}-on)`,
                      }}
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
                    <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400">
                      {ago(item.at)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
