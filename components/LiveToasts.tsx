"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, DollarSign, Inbox, ListChecks, MessageSquare, MessagesSquare, Receipt, SquareKanban, X } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * Live notification cards — the iOS banner, in the app's glass. The shell
 * polls the badge counts while the app is open (components/AppShell.tsx);
 * when something new arrives (a request, a lead, a client message, a team
 * chat message, a booking) the shell pushes a card here and it slides in at
 * the top: phones get a full-width banner under the status bar, desktop a
 * card in the top-right corner. Tap opens the record; swipe up (or the X)
 * dismisses; each card leaves on its own after a few seconds.
 *
 * Opacity-only animation on purpose: a transform on the glass would kill
 * the backdrop blur on iOS (the Liquid Glass rule).
 */

export type LiveToast = {
  id: string;
  kind: "request" | "lead" | "booking" | "payment" | "invoice" | "message" | "chat" | "task";
  title: string;
  sub: string;
  href: string;
};

const ICON: Record<LiveToast["kind"], typeof Inbox> = {
  request: Inbox,
  lead: SquareKanban,
  booking: CalendarClock,
  payment: DollarSign,
  invoice: Receipt,
  message: MessageSquare,
  chat: MessagesSquare,
  task: ListChecks,
};

const AUTO_DISMISS_MS = 8000;
/**
 * Hard ceiling, looking or not (David 2026-10-03: "disappear after a little
 * while if it is not dismissed or interacted with"). What the card announced
 * is kept by the bell — every push is recorded as a notice (lib/push.ts) and
 * the live records (requests, leads, messages) are in the feed anyway — so
 * nothing is lost when it goes.
 */
const MAX_LIFE_MS = 45_000;

function Card({ t, onDismiss }: { t: LiveToast; onDismiss: () => void }) {
  const router = useRouter();
  const touch = useRef<{ y: number } | null>(null);
  // The card leaves on its own only while someone could be looking at it.
  // On a desktop the browser is often behind another window when the poll
  // lands — the old unconditional 8 s timer let the card expire unseen, so
  // the bell updated but "I never got an in-app notification card on
  // desktop" (David 2026-10-02). Hidden or unfocused: the clock pauses.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const looking = () => document.visibilityState === "visible" && document.hasFocus();
    const sync = () => {
      if (looking()) {
        if (!timer) timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    sync();
    const ceiling = setTimeout(onDismiss, MAX_LIFE_MS);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(ceiling);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Icon = ICON[t.kind] ?? Inbox;
  return (
    // Same material and edge as the bell's dropdown (NotificationsSheet):
    // sheet-material + shadow-xl + a hairline ring.
    <div
      className="toast-enter sheet-material pointer-events-auto flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
      onTouchStart={(e) => {
        touch.current = { y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (start && start.y - e.changedTouches[0].clientY > 36) onDismiss();
      }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-700" aria-hidden>
        <Icon size={17} strokeWidth={2.25} />
      </span>
      <button
        type="button"
        onClick={() => {
          hapticImpact("LIGHT");
          onDismiss();
          router.push(t.href);
        }}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-[14px] font-semibold text-gray-900">{t.title}</span>
        {t.sub && <span className="block truncate text-xs text-gray-600">{t.sub}</span>}
      </button>
      <button type="button" onClick={onDismiss} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/60" aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

export default function LiveToasts({ items, onDismiss }: { items: LiveToast[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex flex-col gap-2 lg:inset-x-auto lg:right-5 lg:top-5 lg:w-[360px]" role="status" aria-live="polite">
      {items.slice(0, 3).map((t) => (
        <Card key={t.id} t={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
