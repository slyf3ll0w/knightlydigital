"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Monogram from "@/components/Monogram";
import EmptyState from "@/components/EmptyState";
import { hapticImpact } from "@/lib/haptics";
import type { InboxRow } from "@/lib/inbox";

/**
 * The conversation list, kept current while it is open: a small heartbeat
 * (`/latest`, one indexed row) every few seconds, and when a message has
 * landed the rows are fetched and swapped IN PLACE — the route used to
 * `router.refresh()` (re-rendering the platform layout and the page), which
 * flashed the list on every text (2026-09-29).
 */
const POLL_MS = 4_000;

/**
 * Time today, weekday this week, else date — the thread-list stamp Team Chat
 * uses, in the company's timezone so the server and the phone agree.
 */
function listTime(iso: string, tz: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const key = (t: string | number | Date) => new Date(t).toLocaleDateString("en-CA", { timeZone: tz });
  if (key(d) === key(now)) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  if (now - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

export default function InboxList({ initial, tz }: { initial: InboxRow[]; tz: string }) {
  const [rows, setRows] = useState(initial);
  const stampRef = useRef<string | null>(initial[0]?.at ?? null);

  // A server re-render (pull-to-refresh, coming back to the foreground)
  // hands down fresh rows — take them.
  useEffect(() => {
    setRows(initial);
    stampRef.current = initial[0]?.at ?? null;
  }, [initial]);

  useEffect(() => {
    let stopped = false;
    let inflight = false;
    const tick = async () => {
      if (stopped || inflight || document.visibilityState !== "visible") return;
      inflight = true;
      try {
        const res = await fetch("/api/app/messages/latest");
        if (!res.ok) return;
        const { stamp } = (await res.json()) as { stamp: string | null };
        if (stopped || stamp === stampRef.current) return;
        const full = await fetch("/api/app/messages/inbox");
        if (!full.ok) return;
        const data = (await full.json()) as { rows: InboxRow[]; stamp: string | null };
        if (stopped) return;
        stampRef.current = data.stamp;
        setRows(data.rows);
        // The nav's Messages dot follows the unread count — resync it now.
        window.dispatchEvent(new CustomEvent("wb:nav-counts"));
      } catch {
        /* transient — next tick retries */
      } finally {
        inflight = false;
      }
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          art="contacts"
          showPlusIcon={false}
          title="No conversations yet"
          body="Start one with New message — it texts from your business line once texting is on, and reaches the client portal either way. Texts and portal replies land here."
        />
      </div>
    );
  }

  return (
    <div className="ds-card mt-6 overflow-hidden">
      {rows.map((r, i) => (
        <Link
          key={r.contactId}
          prefetch={false}
          href={`/app/messages/thread/${r.contactId}`}
          onClick={() => hapticImpact("LIGHT")}
          className={`flex items-center gap-3.5 px-3.5 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 ${
            i < rows.length - 1 ? "border-b border-gray-50" : ""
          }`}
        >
          <Monogram name={r.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={`truncate text-sm ${r.unread ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>
                {r.name}
                {r.companyName ? <span className="font-normal text-gray-500"> · {r.companyName}</span> : null}
              </p>
              <span className={`ml-auto shrink-0 text-xs ${r.unread ? "font-semibold text-[color:var(--ds-primary)]" : "text-gray-500"}`}>
                {listTime(r.at, tz)}
              </span>
            </div>
            <p className={`mt-0.5 truncate text-[13px] ${r.unread ? "font-medium text-gray-800" : "text-gray-500"}`}>
              {r.preview}
            </p>
          </div>
          {r.unread > 0 && (
            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-primary)] px-1.5 text-[11px] font-bold text-[color:var(--ds-on-primary)]">
              {r.unread > 99 ? "99+" : r.unread}
            </span>
          )}
          <ChevronRight size={15} className="shrink-0 text-gray-300" />
        </Link>
      ))}
    </div>
  );
}
