"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/**
 * Home-built guided tour (no library). Steps target [data-tour] attributes
 * placed in AppShell and the dashboard; a spotlight cutout + card walk the
 * lifecycle story. Fires once per user (User.tourCompletedAt), replayable
 * from My Profile via /app/dashboard?tour=1.
 *
 * Responsive notes: several targets exist twice in the DOM (desktop sidebar
 * vs mobile tab bar) — the first one actually on screen wins. Steps whose
 * target isn't visible at the current breakpoint fall back to a centered
 * card so the information isn't lost on phones.
 */

type Step = {
  key: string | null; // data-tour target; null = centered card
  title: string;
  body: string;
  show?: (role: string) => boolean;
};

const isManagerRole = (r: string) => r === "OWNER" || r === "ADMIN";
const sellRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";
const moneyRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";

const allSteps: Step[] = [
  {
    key: null,
    title: "Welcome to Streamflaire Hub",
    body: "Here's a quick tour of how work flows through your account — from a new lead to money in the bank. It takes about a minute.",
  },
  {
    key: "workflow",
    title: "Your pipeline at a glance",
    body: "Every number here is live and clickable. The big count on each card is what needs action right now — new requests, approved quotes, jobs waiting on an invoice.",
  },
  {
    key: "today",
    title: "Today's schedule",
    body: "Jobs and appointments scheduled for today show up here, in order, with who's assigned. Tap any of them to jump straight in.",
  },
  {
    key: "create",
    title: "Create anything from here",
    body: "Clients, requests, quotes, jobs, invoices — they all start with this button, from any page.",
    show: (r) => r !== "TECH",
  },
  {
    key: "nav-requests",
    title: "Requests — new leads land here",
    body: "When someone fills out your website form (or you log a phone call), it becomes a request. From there, one click turns it into a quote.",
    show: sellRoles,
  },
  {
    key: "nav-quotes",
    title: "Quotes clients can approve online",
    body: "Send a quote link and your client approves it with a signature from their phone — no printing, no chasing. Approved quotes convert to jobs.",
    show: sellRoles,
  },
  {
    key: "nav-schedule",
    title: "The schedule",
    body: "Month, week, and day views of all your jobs and appointments. Drag unscheduled work onto the calendar to book it.",
  },
  {
    key: "nav-invoices",
    title: "Invoices — getting paid",
    body: "Finished jobs flow here so billing never slips. Track drafts, what's awaiting payment, and what's past due.",
    show: moneyRoles,
  },
  {
    key: "nav-forms",
    title: "Forms feed your pipeline",
    body: "Build the request forms your website and clients use — embed them on your site and submissions appear in Requests automatically.",
    show: isManagerRole,
  },
  {
    key: "nav-team",
    title: "Bring in your team",
    body: "Add teammates free — sales, techs, admins. Each role sees exactly what they should, and you assign work to them on jobs.",
    show: isManagerRole,
  },
  {
    key: null,
    title: "You're all set",
    body: "That's the loop: request → quote → job → invoice → paid. You can replay this tour anytime from My Profile.",
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

export default function TourGuide({ role, needsTour }: { role: string; needsTour: boolean }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const doneRef = useRef(false);

  const steps = useMemo(() => allSteps.filter((s) => !s.show || s.show(role)), [role]);
  const step = steps[idx];

  // Start on the dashboard: first visit (needsTour) or explicit ?tour=1 replay
  useEffect(() => {
    if (active || doneRef.current) return;
    if (pathname !== "/app/dashboard") return;
    const replay = new URLSearchParams(window.location.search).has("tour");
    if (!replay && !needsTour) return;
    if (!replay && sessionStorage.getItem("sf-tour-dismissed")) return;
    const t = setTimeout(() => {
      setIdx(0);
      setActive(true);
    }, 700);
    return () => clearTimeout(t);
  }, [pathname, needsTour, active]);

  // Locate + track the current step's target
  useEffect(() => {
    if (!active || !step) return;
    let raf = 0;
    const el = step.key ? findVisibleTarget(step.key) : null;
    setMissing(!!step.key && !el);
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
  }, [active, idx, step]);

  function finish() {
    doneRef.current = true;
    setActive(false);
    sessionStorage.setItem("sf-tour-dismissed", "1");
    if (needsTour) {
      fetch("/api/app/tour", { method: "POST" }).catch(() => {});
    }
  }

  if (!active || !step) return null;

  const last = idx === steps.length - 1;
  const spotlight = rect && !missing;

  // Card geometry: anchored under/over the target on desktop, bottom sheet
  // on phones, centered when there's no target.
  const isPhone = typeof window !== "undefined" && window.innerWidth < 640;
  let cardStyle: React.CSSProperties = {};
  if (isPhone) {
    // Bottom sheet — unless the target itself sits low (e.g. the tab bar's
    // create button), where the sheet would cover it; then pin to the top.
    const targetLow = !!(spotlight && rect && rect.top > window.innerHeight * 0.55);
    cardStyle = targetLow ? { left: 16, right: 16, top: 16 } : { left: 16, right: 16, bottom: 16 };
  } else if (!spotlight) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else if (rect) {
    const below = rect.bottom + 12 + 230 < window.innerHeight;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 356);
    cardStyle = below
      ? { left, top: rect.bottom + PAD + 12 }
      : { left, bottom: window.innerHeight - rect.top + PAD + 12 };
  }

  return (
    <div className="fixed inset-0 z-[80] app-ui">
      {/* click catcher — the page is display-only while the tour runs */}
      <div className="absolute inset-0" onClick={() => {}} />

      {spotlight && rect ? (
        <div
          className="absolute rounded-[10px] pointer-events-none transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(12, 15, 12, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0C0F0C]/55" />
      )}

      <div
        className="absolute w-auto sm:w-[340px] card-ledger p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 pt-1">
            {idx + 1} of {steps.length}
          </p>
          <button
            onClick={finish}
            className="p-1 -m-1 text-gray-400 hover:text-gray-600"
            aria-label="Skip tour"
          >
            <X size={15} />
          </button>
        </div>
        <h2 className="numeral-ledger text-lg font-semibold text-gray-900 mb-1">{step.title}</h2>
        <p className="text-sm text-gray-600 mb-4">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded disabled:opacity-0"
          >
            Back
          </button>
          <button
            onClick={() => (last ? finish() : setIdx((i) => i + 1))}
            className="px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
