"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  DollarSign,
  FileText,
  Inbox,
  Info,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Phone,
  Receipt,
  SquareKanban,
  X,
  Zap,
} from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import { TOAST_EVENT, type FeedKind, type ToastDetail } from "@/lib/toast";

export { toast } from "@/lib/toast";

/**
 * Live notification cards — the iOS banner, in the app's glass. The shell
 * polls the badge counts while the app is open (components/AppShell.tsx);
 * when something new arrives (a request, a lead, a client message, a team
 * chat message, a booking) the shell pushes a card here and it slides in at
 * the top: phones get a full-width banner under the status bar, desktop a
 * card in the top-right corner. Tap opens the record; swipe up (or the X)
 * dismisses; each card leaves on its own after a few seconds.
 *
 * Under those sit the app's own feedback toasts — `toast("Invoice sent")`
 * from lib/toast.ts, dispatched as a `wb:toast` window event from any
 * client component. Compact one-liners, same glass, gone after 4 s.
 *
 * Opacity-only animation on purpose: a transform on the glass would kill
 * the backdrop blur on iOS (the Liquid Glass rule).
 */

export type LiveToast = {
  id: string;
  kind: FeedKind;
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
  quote: FileText,
  message: MessageSquare,
  chat: MessagesSquare,
  call: Phone,
  task: ListChecks,
  automation: Zap,
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
/** Feedback toasts are about something you just did — a short look is enough. */
const SIMPLE_DISMISS_MS = 4000;

/** True when the OS asks for less motion — the cards then appear without the fade. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

/** Swipe-up-to-dismiss, shared by both card shapes. */
function useSwipeUp(onDismiss: () => void) {
  const touch = useRef<{ y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = { y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = touch.current;
      touch.current = null;
      if (start && start.y - e.changedTouches[0].clientY > 36) onDismiss();
    },
  };
}

function Card({ t, onDismiss, enter }: { t: LiveToast; onDismiss: () => void; enter: string }) {
  const router = useRouter();
  const swipe = useSwipeUp(onDismiss);
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
      className={`${enter} sheet-material pointer-events-auto flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10`}
      {...swipe}
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

// Tone → glyph + the fixed status colors (docs/design-system.md): good and
// bad are the ds status tokens, neutral is plain ink.
const TONE: Record<ToastDetail["tone"], { icon: typeof Check; className: string }> = {
  good: { icon: Check, className: "bg-[color:var(--ds-good-soft)] text-[color:var(--ds-good)]" },
  neutral: { icon: Info, className: "bg-gray-500/10 text-gray-600" },
  bad: { icon: AlertTriangle, className: "bg-[color:var(--ds-bad-soft)] text-[color:var(--ds-bad)]" },
};

/** The compact feedback card behind `toast()` — one line, 4 s, same glass. */
function SimpleCard({ t, onDismiss, enter }: { t: ToastDetail; onDismiss: () => void; enter: string }) {
  const router = useRouter();
  const swipe = useSwipeUp(onDismiss);
  useEffect(() => {
    const timer = setTimeout(onDismiss, SIMPLE_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tone = TONE[t.tone] ?? TONE.good;
  const Icon = tone.icon;
  const body = (
    <>
      {t.title ? (
        <>
          <span className="block truncate text-[13.5px] font-semibold text-gray-900">{t.title}</span>
          <span className="block truncate text-xs text-gray-600">{t.message}</span>
        </>
      ) : (
        <span className="block truncate text-[13.5px] font-semibold text-gray-900">{t.message}</span>
      )}
    </>
  );
  return (
    <div
      className={`${enter} sheet-material pointer-events-auto flex items-center gap-2.5 rounded-2xl py-2 pl-3 pr-1.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10`}
      {...swipe}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.className}`} aria-hidden>
        <Icon size={15} strokeWidth={2.5} />
      </span>
      {t.href ? (
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            onDismiss();
            router.push(t.href as string);
          }}
          className="min-w-0 flex-1 text-left"
        >
          {body}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{body}</span>
      )}
      <button type="button" onClick={onDismiss} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/60" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export default function LiveToasts({ items, onDismiss }: { items: LiveToast[]; onDismiss: (id: string) => void }) {
  const reduced = usePrefersReducedMotion();
  // `toast()` cards — kept here so nothing above has to know about them.
  const [simple, setSimple] = useState<ToastDetail[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d || !d.id || !d.message) return;
      setSimple((s) => [...s.filter((x) => x.id !== d.id), d].slice(-3));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  const dismissSimple = (id: string) => setSimple((s) => s.filter((x) => x.id !== id));

  if (items.length === 0 && simple.length === 0) return null;
  const enter = reduced ? "" : "toast-enter";
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex flex-col gap-2 lg:inset-x-auto lg:right-5 lg:top-5 lg:w-[360px]" role="status" aria-live="polite">
      {items.slice(0, 3).map((t) => (
        <Card key={t.id} t={t} onDismiss={() => onDismiss(t.id)} enter={enter} />
      ))}
      {simple.map((t) => (
        <SimpleCard key={t.id} t={t} onDismiss={() => dismissSimple(t.id)} enter={enter} />
      ))}
    </div>
  );
}
