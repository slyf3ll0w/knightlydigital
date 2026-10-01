"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/**
 * Home-built guided tour (no library). Steps target [data-tour] attributes
 * placed in AppShell, the dashboard and the Atlas home button; a spotlight
 * cutout + card walk a new user around the app as it is today. Fires once per
 * user (User.tourCompletedAt), replayable from My Profile via
 * /app/dashboard?tour=1.
 *
 * Responsive + role handling is by what's on screen: several targets exist
 * twice in the DOM (desktop header vs mobile tab bar) and the first one
 * actually visible wins. A step whose target isn't rendered for this
 * device or role (Search on a phone, More at a desk, Create for a tech,
 * Atlas when it's off) is dropped when the tour starts, so every stop
 * points at something real.
 */

type Step = {
  key: string | null; // data-tour target; null = centered card
  title: string;
  body: string;
};

const allSteps: Step[] = [
  {
    key: null,
    title: "Welcome to WorkBench",
    body: "A one-minute look around. Everything starts here on Home.",
  },
  {
    key: "workflow",
    title: "Needs you",
    body: "What's waiting on you right now: new requests, quotes to follow up, jobs to invoice, money past due. Tap a row to handle it.",
  },
  {
    key: "today",
    title: "Today",
    body: "Every job and appointment on the books today, in order. The full calendar is under Schedule.",
  },
  {
    key: "create",
    title: "Create anything",
    body: "Clients, leads, quotes, estimates, jobs, invoices and payments all start from this button, on any page.",
  },
  {
    key: "search",
    title: "Find anything",
    body: "Search clients, jobs, quotes and invoices by name or number. Ctrl+K (⌘K on a Mac) opens it from anywhere.",
  },
  {
    key: "more",
    title: "Everything else is under More",
    body: "Clients, sales, field work, money and your business settings, grouped by section.",
  },
  {
    key: "chat",
    title: "Team chat",
    body: "Talk with your crew in one place. Client texts and calls have their own Messages and Calls pages.",
  },
  {
    key: "atlas",
    title: "Meet Atlas",
    body: "Your AI assistant. Ask about your business, or tell it what to do: draft a quote, look up a client, schedule a job.",
  },
  {
    key: null,
    title: "You're all set",
    body: "Stuck on something? Help & Feedback has step-by-step guides. You can replay this tour anytime from My Profile.",
  },
];

const PAD = 6; // spotlight breathing room around the target

function findVisibleTarget(key: string): Element | null {
  const els = document.querySelectorAll(`[data-tour="${key}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

export default function TourGuide({ needsTour }: { needsTour: boolean }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const doneRef = useRef(false);

  const step = active ? steps[idx] : undefined;

  // Start on the dashboard: first visit (needsTour) or explicit ?tour=1 replay.
  // The step list is fixed at start from what's actually rendered.
  useEffect(() => {
    if (active || doneRef.current) return;
    if (pathname !== "/app/dashboard") return;
    const replay = new URLSearchParams(window.location.search).has("tour");
    if (!replay && !needsTour) return;
    if (!replay && sessionStorage.getItem("sf-tour-dismissed")) return;
    const t = setTimeout(() => {
      setSteps(allSteps.filter((s) => !s.key || findVisibleTarget(s.key)));
      setIdx(0);
      setActive(true);
    }, 700);
    return () => clearTimeout(t);
  }, [pathname, needsTour, active]);

  // Locate + track the current step's target
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const el = step.key ? findVisibleTarget(step.key) : null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    const update = () => {
      raf = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  function finish() {
    doneRef.current = true;
    setActive(false);
    sessionStorage.setItem("sf-tour-dismissed", "1");
    if (needsTour) {
      fetch("/api/app/tour", { method: "POST" }).catch(() => {});
    }
  }

  if (!step) return null;

  const last = idx === steps.length - 1;
  const spotlight = step.key ? rect : null;

  // Card geometry: anchored under/over the target on desktop, bottom sheet
  // on phones, centered when there's no target.
  const isPhone = window.innerWidth < 640;
  let cardStyle: React.CSSProperties = {};
  if (isPhone) {
    // Bottom sheet, unless the target itself sits low (the tab bar's Chat,
    // More and create buttons), where the sheet would cover it; then pin
    // to the top.
    const targetLow = !!(spotlight && spotlight.top > window.innerHeight * 0.55);
    cardStyle = targetLow
      ? { left: 16, right: 16, top: "calc(16px + env(safe-area-inset-top))" }
      : { left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))" };
  } else if (!spotlight) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const below = spotlight.bottom + 12 + 230 < window.innerHeight;
    const left = Math.min(Math.max(spotlight.left, 16), window.innerWidth - 356);
    cardStyle = below
      ? { left, top: spotlight.bottom + PAD + 12 }
      : { left, bottom: window.innerHeight - spotlight.top + PAD + 12 };
  }

  return (
    <div className="fixed inset-0 z-[80] app-ui" role="dialog" aria-modal="true" aria-label="Welcome tour">
      {/* click catcher — the page is display-only while the tour runs */}
      <div className="absolute inset-0" />

      {spotlight ? (
        <div
          className="absolute rounded-[12px] pointer-events-none transition-all duration-300"
          style={{
            left: spotlight.left - PAD,
            top: spotlight.top - PAD,
            width: spotlight.width + PAD * 2,
            height: spotlight.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(10, 20, 40, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0A1428]/55" />
      )}

      <div className="ds-card absolute w-auto p-5 shadow-2xl sm:w-[340px]" style={cardStyle}>
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <p className="ds-small pt-1 text-[11px] font-semibold">
            {idx + 1} of {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="-m-1 p-1 text-[color:var(--ds-faint)] hover:text-[color:var(--ds-ink)]"
            aria-label="Skip tour"
          >
            <X size={15} />
          </button>
        </div>
        <h2 className="mb-1 text-lg font-semibold text-[color:var(--ds-ink)]">{step.title}</h2>
        <p className="mb-4 text-sm leading-relaxed text-[color:var(--ds-ink-2)]">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="ds-btn ds-btn-sm ds-btn-ghost disabled:invisible"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setIdx((i) => i + 1))}
            className="ds-btn ds-btn-sm ds-btn-primary"
          >
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
