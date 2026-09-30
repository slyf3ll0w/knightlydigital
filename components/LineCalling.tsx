"use client";

import { useEffect } from "react";
import { AlertCircle, PhoneOutgoing, X } from "lucide-react";
import { hapticNotify } from "@/lib/haptics";
import { dismissLineCallNotice, setLineCalling, useLineCallNotice, type LineCallNotice } from "@/lib/line-calling";

/**
 * Mounted once by the platform layout: publishes whether Call buttons dial
 * from the business line (lib/line-calling.ts) and shows the one notice
 * those calls need — "pick up your phone" for the cell flow, or why the
 * call did not go out. Same glass banner as components/LiveToasts.tsx
 * (opacity-only animation: a transform on the glass kills the blur on iOS).
 */
export default function LineCalling({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    setLineCalling(enabled);
    return () => setLineCalling(false);
  }, [enabled]);

  const notice = useLineCallNotice();
  if (!notice) return null;
  // Mounted outside AppShell, so it carries the shell's own wrapper classes:
  // the glass recipe (.app-ui .sheet-material) and the theme tokens (.ds) are
  // scoped to them — without them the banner paints as clear glass, unreadable.
  return (
    <div className="app-ui ds pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex flex-col gap-2 lg:inset-x-auto lg:right-5 lg:top-5 lg:w-[360px]" role="status" aria-live="polite">
      <Card key={notice.id} n={notice} onDismiss={() => dismissLineCallNotice(notice.id)} />
    </div>
  );
}

const AUTO_DISMISS_MS = 10_000;

function Card({ n, onDismiss }: { n: LineCallNotice; onDismiss: () => void }) {
  useEffect(() => {
    hapticNotify(n.kind === "error" ? "ERROR" : "SUCCESS");
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const error = n.kind === "error";
  const Icon = error ? AlertCircle : PhoneOutgoing;
  return (
    <div className="toast-enter sheet-material pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/60 px-3.5 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.18)] dark:border-white/10">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${error ? "bg-red-500/10 text-red-700" : "bg-green-500/10 text-green-700"}`}
        aria-hidden
      >
        <Icon size={17} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-semibold text-gray-900">{n.title}</span>
        <span className="block text-xs text-gray-600">{n.sub}</span>
      </div>
      <button type="button" onClick={onDismiss} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/60" aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}
