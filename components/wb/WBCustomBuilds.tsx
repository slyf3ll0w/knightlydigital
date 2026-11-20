"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Calculator,
  Check,
  ClipboardList,
  Globe,
  MessageSquare,
  Plug,
  Truck,
  Workflow,
  Zap,
} from "lucide-react";

/**
 * Custom software, "If you do it by hand today, we can probably build it"
 * (David 2026-11-19: "content is good but it could look better"). The six
 * kinds of thing we build, each shown as a before/after: the by-hand way
 * gets crossed out, and a small coded piece of WorkBench (Lexend, the app's
 * colors, demo company Brightwire Electric) plays out what it becomes. The
 * list picks the example; it steps through on its own while on screen until
 * someone picks one. Under reduced motion it holds still on the first, with
 * every fragment in its finished state.
 */

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const NAVY = "#1D2E52";
const AUTO_MS = 6200;

const BUILDS = [
  {
    icon: Workflow,
    title: "Workflows that match your process",
    body: "The steps, sign-offs and hand-offs your crew already follows, built in, so the app walks the job the way you do.",
    byHand: "Texting the crew who does what next",
    screen: "Job steps",
  },
  {
    icon: ClipboardList,
    title: "Forms and checklists for your trade",
    body: "Inspection sheets, intake questions, job checklists and client fields with the exact wording you use.",
    byHand: "A paper checklist on the clipboard",
    screen: "Checklist",
  },
  {
    icon: Plug,
    title: "Connections to your other tools",
    body: "Your supplier, your accounting, your ad accounts, or a system you already pay for, talking to WorkBench.",
    byHand: "Typing the same numbers into two systems",
    screen: "Connections",
  },
  {
    icon: Zap,
    title: "Automations that do the busywork",
    body: "Texts, reminders, follow-ups and task hand-offs that fire on the moments that matter in your business.",
    byHand: "Remembering to send the reminder",
    screen: "Automations",
  },
  {
    icon: BarChart3,
    title: "Reports you actually read",
    body: "The numbers you run the business by, in the shape you think about them, without exporting a spreadsheet.",
    byHand: "A spreadsheet every Friday night",
    screen: "Reports",
  },
  {
    icon: Globe,
    title: "Pieces your clients touch",
    body: "Request forms for your website, estimate tools, and pages that carry your name and your way of doing things.",
    byHand: "Taking every request over the phone",
    screen: "Your website",
  },
] as const;

function reduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts 0 → max, one step every `ms`, from mount (max at once under reduced motion). */
function useSteps(max: number, ms = 650, wait = 500) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (reduced()) {
      setS(max);
      return;
    }
    const t = Array.from({ length: max }, (_, k) => setTimeout(() => setS(k + 1), wait + k * ms));
    return () => t.forEach(clearTimeout);
  }, [max, ms, wait]);
  return s;
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full transition-colors duration-300 ${on ? "bg-[#17703B] text-white" : "bg-white ring-1 ring-[#D5DAE3]"}`}>
      {on && <Check className="wb-pop-in h-3 w-3" strokeWidth={3.2} />}
    </span>
  );
}

/* ── the six fragments ───────────────────────────────────────────────────── */

function FragWorkflow() {
  const s = useSteps(5, 700);
  const stages = ["Site visit", "Permit filed", "Rough-in", "Inspection", "Client sign-off"];
  return (
    <div>
      <p className="text-[12px] text-gray-500">Panel upgrade · Derek Olsen</p>
      <div className="mt-3 space-y-1.5">
        {stages.map((st, i) => {
          const done = i < Math.min(s, 3);
          const now = i === Math.min(s, 3);
          return (
            <div key={st} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] transition-colors duration-300 ${now ? "bg-white shadow-[0_0_0_1px_#0B57D8]" : "bg-white/70"}`}>
              <Tick on={done} />
              <span className={`flex-1 ${done ? "text-gray-500" : "font-semibold text-gray-900"}`}>{st}</span>
              {now && s >= 4 && (
                <span className="wb-pop-in flex items-center gap-1.5 rounded-full bg-[#E8EEFB] px-2 py-0.5 text-[10.5px] font-semibold text-[#22406E]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3E5277] text-[7.5px] text-white">MB</span>
                  Marcus Bell
                </span>
              )}
            </div>
          );
        })}
      </div>
      {s >= 5 && (
        <p className="wb-toast-in mt-3 flex items-center gap-2 rounded-lg bg-[#0A1428] px-3 py-2 text-[11.5px] text-white">
          <Bell className="h-3.5 w-3.5 text-[#FF8B33]" /> Handed to Marcus Bell for the inspection
        </p>
      )}
    </div>
  );
}

function FragChecklist() {
  const s = useSteps(6, 600);
  const items = ["Main breaker rating noted", "Grounding and bonding checked", "Every circuit labeled", "Photo of the open panel"];
  return (
    <div>
      <p className="text-[12px] text-gray-500">Panel inspection · Grace Kim</p>
      <div className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-[#E3E6EC]">
        {items.map((it, i) => (
          <div key={it} className="flex items-center gap-3 border-b border-[#EEF0F3] px-3 py-2.5 text-[12.5px] last:border-0">
            <Tick on={s > i} />
            <span className={s > i ? "text-gray-500" : "font-semibold text-gray-900"}>{it}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-[#EEF0F3] bg-[#F7F8FA] px-3 py-2.5 text-[12.5px]">
          <span className="text-gray-600">Breaker spaces</span>
          <span className={`rounded-md bg-white px-2 py-0.5 font-semibold text-gray-900 ring-1 ring-[#E3E6EC] transition-opacity ${s >= 5 ? "opacity-100" : "opacity-0"}`}>24</span>
        </div>
      </div>
      {s >= 6 && (
        <span className="wb-stamp-now mt-3 inline-flex rotate-[-4deg] rounded-md border-[3px] border-[#17703B] px-2.5 py-0.5 text-[12px] font-black uppercase tracking-[0.12em] text-[#17703B]">
          Signed off
        </span>
      )}
    </div>
  );
}

function FragConnections() {
  const s = useSteps(4, 650);
  const nodes = [
    { icon: Truck, label: "Your supplier", x: 22, y: 14 },
    { icon: Calculator, label: "Accounting", x: 78, y: 14 },
    { icon: BarChart3, label: "Ad accounts", x: 50, y: 86 },
  ];
  return (
    <div>
      <div className="relative h-[200px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {nodes.map((n, i) => (
            <line
              key={n.label}
              x1={50}
              y1={52}
              x2={n.x}
              y2={n.y}
              stroke={s > i ? "#0B57D8" : "#D5DAE3"}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              className={s > i ? "wb-flow-in" : ""}
              style={{ strokeWidth: 2 }}
            />
          ))}
        </svg>
        <span className="absolute left-1/2 top-[52%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-white shadow-lg" style={{ background: NAVY }}>
          WorkBench
        </span>
        {nodes.map((n, i) => (
          <span
            key={n.label}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-800 shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_8px_16px_-10px_rgba(10,20,40,0.4)] ${s > i ? "wb-pop-in" : "opacity-50"}`}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <n.icon className="h-3.5 w-3.5 text-[#F86A0A]" />
            {n.label}
          </span>
        ))}
      </div>
      {s >= 4 && (
        <p className="wb-toast-in mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11.5px] text-gray-700 ring-1 ring-[#E3E6EC]">
          <Check className="h-3.5 w-3.5 text-[#17703B]" strokeWidth={3} /> Supplier price list synced · 214 items
        </p>
      )}
    </div>
  );
}

function FragAutomation() {
  const s = useSteps(4, 750);
  const cards = [
    { k: "When", t: "A job is marked Done", tone: "bg-[#0A1428] text-white" },
    { k: "Then", t: "Text the client a thank-you", tone: "bg-white text-gray-900 ring-1 ring-[#E3E6EC]" },
    { k: "2 days later", t: "Task for the office: ask for a review", tone: "bg-white text-gray-900 ring-1 ring-[#E3E6EC]" },
  ];
  return (
    <div>
      <div className="space-y-2">
        {cards.map((c, i) => (
          <div key={c.t} className={`${s > i ? "wb-row-in" : "opacity-0"}`}>
            <div className={`rounded-lg px-3 py-2.5 ${c.tone}`}>
              <span className={`block text-[10.5px] font-semibold ${i === 0 ? "text-[#FF8B33]" : "text-[#0B57D8]"}`}>{c.k}</span>
              <span className="block text-[12.5px] font-semibold">{c.t}</span>
            </div>
          </div>
        ))}
      </div>
      {s >= 4 && (
        <p className="wb-toast-in mt-3 flex items-center gap-2 rounded-lg bg-[#0A1428] px-3 py-2 text-[11.5px] text-white">
          <MessageSquare className="h-3.5 w-3.5 text-[#FF8B33]" /> Sent to Maria Hernandez: &ldquo;Thanks for having us out!&rdquo;
        </p>
      )}
    </div>
  );
}

function FragReport() {
  const s = useSteps(1, 0, 350);
  const rows = [
    { l: "Panel upgrades", v: 8420 },
    { l: "EV chargers", v: 5960 },
    { l: "Service calls", v: 3180 },
    { l: "Lighting", v: 2240 },
  ];
  const max = 8420;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-gray-500">Profit by job type · this month</p>
        <p className="text-[12px] font-semibold text-[#17703B]">+12% vs last</p>
      </div>
      <div className="mt-3 space-y-2.5 rounded-lg bg-white p-3 ring-1 ring-[#E3E6EC]">
        {rows.map((r, i) => (
          <div key={r.l}>
            <div className="flex justify-between text-[11.5px]">
              <span className="font-semibold text-gray-800">{r.l}</span>
              <span className="tabular-nums text-gray-600">${r.v.toLocaleString("en-US")}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#EEF0F3]">
              <div
                className="h-full rounded-full transition-[width] duration-[1100ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{ width: s ? `${(r.v / max) * 100}%` : "0%", background: i === 0 ? "#F86A0A" : "#0B57D8", transitionDelay: `${i * 140}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FragClientForm() {
  const s = useSteps(4, 750);
  return (
    <div>
      <div className="rounded-lg bg-white p-3 ring-1 ring-[#E3E6EC]">
        <p className="text-[12.5px] font-semibold text-gray-900">Request an estimate · Brightwire Electric</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
          <span className="rounded-md bg-[#F3F5F9] px-2.5 py-2 text-gray-800">{s >= 1 ? "Olivia Park" : " "}</span>
          <span className="rounded-md bg-[#F3F5F9] px-2.5 py-2 text-gray-800">{s >= 1 ? "(555) 014-2290" : " "}</span>
          <span className="col-span-2 rounded-md bg-[#F3F5F9] px-2.5 py-2 text-gray-800">{s >= 2 ? "Three outdoor outlets on the back patio" : " "}</span>
        </div>
        <div className="mt-2.5 flex justify-end">
          <span className={`inline-flex items-center gap-1 rounded-md bg-[#F86A0A] px-3 py-1.5 text-[11.5px] font-semibold text-white transition-transform ${s === 3 ? "scale-95" : ""}`}>
            Send <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
      {s >= 4 && (
        <div className="wb-row-in mt-3 flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[0_0_0_1px_#F86A0A55]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F86A0A] text-[9.5px] font-semibold text-white">OP</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-gray-900">Olivia Park · Outdoor outlets</span>
            <span className="block text-[10.5px] text-[#C2410C]">New request · from your website</span>
          </span>
        </div>
      )}
    </div>
  );
}

const FRAGS = [FragWorkflow, FragChecklist, FragConnections, FragAutomation, FragReport, FragClientForm];

/** The before/after panel for one item. Remounted per pick so its moment replays. */
function Panel({ i }: { i: number }) {
  const b = BUILDS[i];
  const Frag = FRAGS[i];
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_50px_-26px_rgba(10,20,40,0.45)]" style={FONT}>
      <div className="relative border-b border-[#EEF0F3] px-5 py-4">
        <span className="text-[11px] font-semibold text-gray-500">By hand today</span>
        <span className="relative mt-0.5 block w-fit text-[15px] text-gray-600">
          {b.byHand}
          <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="wb-scribble absolute -left-1 top-1/2 h-4 w-[calc(100%+8px)] -translate-y-1/2" aria-hidden style={{ ["--wb-draw-delay" as string]: "0.15s" }}>
            <path d="M2 12 C 50 6, 120 14, 198 7" pathLength={1} stroke="#F86A0A" strokeWidth={3} fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div className="bg-[#F5F7FA] p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-gray-500">
          <span className="flex h-5 w-5 items-center justify-center rounded" style={{ background: NAVY }}>
            <b.icon className="h-3 w-3 text-[#FF8B33]" />
          </span>
          In WorkBench · {b.screen}
        </div>
        <div className="min-h-[230px] select-none text-left" aria-hidden>
          <Frag />
        </div>
      </div>
    </div>
  );
}

export default function WBCustomBuilds() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (picked || !seen || reduced() || window.innerWidth < 1024) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % BUILDS.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [active, picked, seen]);

  return (
    <div ref={ref} className="grid items-start gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
      <ul className="space-y-2.5">
        {BUILDS.map(({ icon: Icon, title, body }, i) => {
          const on = i === active;
          return (
            <li
              key={title}
              className={`rounded-xl transition-[background-color,box-shadow] duration-300 ${
                on ? "bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]" : "hover:bg-white/70"
              }`}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked(true);
                  setActive(i);
                }}
                className="flex w-full gap-5 p-5 text-left"
              >
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-lg transition-colors duration-300 ${on ? "bg-[#F86A0A]" : "bg-[#0A1428]"} shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]`}
                >
                  <Icon className={`h-5 w-5 ${on ? "text-white" : "text-[#FF8B33]"}`} strokeWidth={2.1} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[18px] font-extrabold text-[#0A1428]">{title}</span>
                  <span className="mt-1.5 block text-[15px] leading-relaxed text-gray-600">{body}</span>
                </span>
              </button>
              {/* the picked item's example, under it on phones */}
              {on && (
                <div className="px-3 pb-3 lg:hidden">
                  <Panel key={`m-${i}`} i={i} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sticky top-28 hidden lg:block">
        <Panel key={active} i={active} />
      </div>
    </div>
  );
}
