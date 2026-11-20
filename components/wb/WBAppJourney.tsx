"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  FileSignature,
  FileText,
  Home,
  Inbox,
  MessagesSquare,
  Play,
  Plus,
  Receipt,
  Search,
  Send,
  Settings,
  Square,
  Users,
  Wallet,
} from "lucide-react";

/**
 * "Win more of the work", round 3 (David 2026-11-19: "show what it looks
 * like in the software for each of the steps, including the fun animations;
 * the generic card made it look generic"). One job's real path through
 * WorkBench, each step on a coded copy of that screen of the app (same
 * sidebar, top bar, typeface and colors as WBLiveApp, the hero's copy of the
 * dashboard), each with the app's own kind of moment:
 *   Request   — the online booking slides into Requests
 *   Quote     — lines fill in, the total counts up, Send → paper plane
 *   Approved  — the client's signature draws itself, APPROVED stamps down,
 *               the deposit lands, the job is created
 *   Scheduled — the job drops onto Thursday 9:00 on the calendar
 *   Done      — clocked in, the timer runs, photos pop in, Complete
 *   Invoiced  — the balance invoice, Send → paper plane
 *   Paid      — PAID stamps down, confetti, Collected counts up
 * A rail above names the step; it loops while on screen and rests on Paid
 * under reduced motion. Demo company (Brightwire Electric) only.
 */

type StepKey = "req" | "quote" | "ok" | "sched" | "done" | "inv" | "paid";
const STEPS: { key: StepKey; label: string; icon: typeof Inbox; nav: string }[] = [
  { key: "req", label: "Request", icon: Inbox, nav: "Requests" },
  { key: "quote", label: "Quote", icon: FileText, nav: "Quotes" },
  { key: "ok", label: "Approved", icon: FileSignature, nav: "Quotes" },
  { key: "sched", label: "Scheduled", icon: CalendarDays, nav: "Schedule" },
  { key: "done", label: "Done", icon: ClipboardCheck, nav: "Jobs" },
  { key: "inv", label: "Invoiced", icon: Receipt, nav: "Invoices" },
  { key: "paid", label: "Paid", icon: Wallet, nav: "Invoices" },
];
const STEP_MS = 4600;
const NAVY = "#1D2E52";
const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };

/** A beat inside a step: 0 on arrival, then 1, 2, 3 on a timer. */
function useBeat(active: boolean, times: number[]) {
  const [b, setB] = useState(0);
  useEffect(() => {
    if (!active) return;
    setB(0);
    const t = times.map((ms, k) => setTimeout(() => setB(k + 1), ms));
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return b;
}

function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {sub && <p className="text-[10.5px] text-gray-500">{sub}</p>}
        <p className="text-[19px] font-semibold text-gray-900">{title}</p>
      </div>
      {right}
    </div>
  );
}

function Chip({ tone, children }: { tone: "blue" | "amber" | "green" | "gray"; children: React.ReactNode }) {
  const c = { blue: "bg-[#E8EEFB] text-[#22406E]", amber: "bg-[#FDF3DC] text-[#8A5A07]", green: "bg-[#E3F5EA] text-[#17703B]", gray: "bg-[#ECEEF2] text-gray-600" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c}`}>{children}</span>;
}

function Plane({ go }: { go: boolean }) {
  return go ? <Send className="wb-plane pointer-events-none absolute right-3 top-1/2 h-4 w-4 text-[#0B57D8]" /> : null;
}

/* ── the screens ─────────────────────────────────────────────────────────── */

function RequestsScreen({ on }: { on: boolean }) {
  const b = useBeat(on, [500, 2200]);
  const rows = [
    { who: "Hannah Brooks", what: "Smoke detectors, whole home", when: "Yesterday", src: "Website form" },
    { who: "Tom Becker", what: "Walkthrough for panel upgrade", when: "Mon", src: "Phone call" },
  ];
  return (
    <div>
      <PageHead title="Requests" right={<span className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: NAVY }}>+ New request</span>} />
      <div className="mt-3 flex gap-1.5 text-[11px]">
        {["New", "Assessment", "Converted"].map((t, i) => (
          <span key={t} className={`rounded-full px-3 py-1 ${i === 0 ? "bg-[#1D2E52] font-semibold text-white" : "bg-white text-gray-600 ring-1 ring-[#E3E6EC]"}`}>
            {t} {i === 0 && <span className="ml-1 opacity-80">{b >= 1 ? 3 : 2}</span>}
          </span>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
        {b >= 1 && (
          <div className="wb-row-in flex items-center gap-3 border-b border-[#EEF0F3] bg-[#FFF7EF] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F86A0A] text-[10px] font-semibold text-white">GK</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-gray-900">Grace Kim — Ceiling fan install x2</span>
              <span className="block text-[10.5px] text-[#C2410C]">Booked online just now · Thu or Fri morning</span>
            </span>
            <span className={`rounded-lg px-2.5 py-1 text-[10.5px] font-semibold text-white transition-transform ${b >= 2 ? "scale-105" : ""}`} style={{ background: NAVY }}>
              Create quote
            </span>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.who} className="flex items-center gap-3 border-b border-[#EEF0F3] px-4 py-3 last:border-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3E5277] text-[10px] font-semibold text-white">
              {r.who.split(" ").map((w) => w[0]).join("")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-gray-900">
                {r.who} — {r.what}
              </span>
              <span className="block text-[10.5px] text-gray-500">
                {r.when} · {r.src}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

const QUOTE_LINES: [string, string, number][] = [
  ["Ceiling fan install", "2 × $190.00", 380],
  ["Wiring + new fan-rated box", "1 × $140.00", 140],
];

function QuoteScreen({ on }: { on: boolean }) {
  const b = useBeat(on, [400, 1100, 1900, 3000]);
  const total = (b >= 1 ? 380 : 0) + (b >= 2 ? 140 : 0);
  return (
    <div>
      <PageHead sub="Grace Kim · 412 Oak Ln, Plano" title="Quote #1051" right={b >= 4 ? <Chip tone="blue">Sent · Viewed</Chip> : <Chip tone="gray">Draft</Chip>} />
      <div className="mt-3 overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-[#EEF0F3] px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-gray-400">
          <span>Product / Service</span>
          <span>Qty × price</span>
          <span>Total</span>
        </div>
        {QUOTE_LINES.map(([a, q, t], k) =>
          b >= k + 1 ? (
            <div key={a} className="wb-row-in grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-[#EEF0F3] px-4 py-2.5 text-[12px]">
              <span className="font-semibold text-gray-900">{a}</span>
              <span className="text-gray-500">{q}</span>
              <span className="font-semibold tabular-nums text-gray-900">${t.toFixed(2)}</span>
            </div>
          ) : (
            <div key={a} className="h-[39px] border-b border-[#EEF0F3]" />
          ),
        )}
        <div className="flex items-center justify-between bg-[#F8F9FB] px-4 py-3">
          <span className="text-[10.5px] font-semibold text-[#0B57D8]">Deposit 25% on approval</span>
          <span className="text-[14px] font-semibold tabular-nums text-gray-900">Total ${total.toFixed(2)}</span>
        </div>
      </div>
      <div className="relative mt-3 flex justify-end">
        <span className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11.5px] font-semibold text-white transition-transform duration-200 ${b === 3 ? "scale-95" : ""}`} style={{ background: NAVY }}>
          <Send className="h-3.5 w-3.5" />
          {b >= 4 ? "Sent to Grace" : "Send to client"}
        </span>
        <Plane go={b >= 3} />
      </div>
    </div>
  );
}

function ApprovedScreen({ on }: { on: boolean }) {
  const b = useBeat(on, [300, 1500, 2500, 3400]);
  return (
    <div>
      <PageHead sub="Grace Kim · Quote #1051" title="Ceiling fan install" right={b >= 2 ? <Chip tone="green">Approved</Chip> : <Chip tone="blue">Awaiting response</Chip>} />
      <div className="relative mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#E3E6EC] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">Client signature</p>
          <svg viewBox="0 0 240 70" className="mt-1 h-[64px] w-full">
            {b >= 1 && (
              <path
                d="M12 48 C 22 18, 38 18, 34 44 C 31 60, 22 52, 30 40 C 40 26, 52 30, 56 44 C 60 54, 66 40, 74 36 C 82 32, 80 50, 90 46 C 100 42, 104 30, 112 34 C 120 38, 116 52, 128 48 C 140 44, 146 28, 158 32 C 170 36, 168 50, 182 44 C 196 38, 210 30, 228 36"
                pathLength={1}
                stroke="#1D2E52"
                strokeWidth={2.4}
                fill="none"
                strokeLinecap="round"
                className="wb-sign"
              />
            )}
            <line x1="8" y1="62" x2="232" y2="62" stroke="#E3E6EC" strokeWidth="1.5" />
          </svg>
          <p className="text-[10.5px] text-gray-500">Signed online · Oct 26, 7:42 PM</p>
        </div>
        <div className="space-y-2">
          <div className={`flex items-center gap-2.5 rounded-2xl border bg-white p-3.5 transition-colors duration-500 ${b >= 3 ? "border-green-300" : "border-[#E3E6EC]"}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-500 ${b >= 3 ? "bg-[#17A34A] text-white" : "bg-[#ECEEF2] text-gray-400"}`}>
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span>
              <span className="block text-[12px] font-semibold text-gray-900">Deposit {b >= 3 ? "paid" : "due"}</span>
              <span className="block text-[10.5px] tabular-nums text-gray-500">$130.00 · card</span>
            </span>
          </div>
          <div className={`flex items-center gap-2.5 rounded-2xl border border-[#E3E6EC] bg-white p-3.5 transition-opacity duration-500 ${b >= 4 ? "opacity-100" : "opacity-40"}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1D2E52] text-white">
              <Briefcase className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[12px] font-semibold text-gray-900">Job #318 created</span>
              <span className="block text-[10.5px] text-gray-500">Ready to schedule</span>
            </span>
          </div>
        </div>
        {b >= 2 && (
          <span className="wb-stamp-now pointer-events-none absolute left-[16%] top-[30%] rounded-lg border-[3px] border-[#17A34A] px-3 py-1 text-[22px] font-black tracking-[0.12em] text-[#17A34A]" style={{ transform: "rotate(-10deg)" }}>
            APPROVED
          </span>
        )}
      </div>
    </div>
  );
}

function ScheduleScreen({ on }: { on: boolean }) {
  const b = useBeat(on, [700, 2400]);
  const days = ["Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30"];
  const hours = ["8a", "9a", "10a", "11a", "12p"];
  const jobs: [number, number, number, string][] = [
    [0, 0, 2, "Maria H. · AC disconnect"],
    [1, 1, 1, "Olivia P. · Outlets"],
    [2, 2, 2, "James W. · EV charger"],
    [4, 0, 1, "Derek O. · Sub-panel"],
    [3, 3, 1, "Alicia G. · Garage"],
  ];
  const ROW = 40;
  return (
    <div>
      <PageHead title="Schedule" right={<span className="text-[11px] font-semibold text-gray-600">Oct 26 – Oct 30</span>} />
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
        <div className="grid grid-cols-[40px_repeat(5,1fr)] border-b border-[#EEF0F3] text-center text-[10px] font-semibold text-gray-500">
          <span />
          {days.map((d, i) => (
            <span key={d} className={`py-2 ${i === 3 ? "text-[#0B57D8]" : ""}`}>
              {d}
            </span>
          ))}
        </div>
        <div className="relative grid grid-cols-[40px_repeat(5,1fr)]">
          <div>
            {hours.map((h) => (
              <div key={h} className="pr-1.5 pt-1 text-right text-[9px] text-gray-400" style={{ height: ROW }}>
                {h}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="border-l border-[#F0F2F5]">
              {hours.map((h) => (
                <div key={h} className="border-b border-[#F3F4F7]" style={{ height: ROW }} />
              ))}
            </div>
          ))}
          {jobs.map(([day, start, len, label]) => (
            <div
              key={label}
              className="absolute rounded-md border border-[#C9D3E6] bg-[#E8EEFB] px-1.5 py-1 text-[9.5px] font-semibold text-[#22406E]"
              style={{ left: `calc(40px + (100% - 40px) * ${day} / 5 + 3px)`, width: "calc((100% - 40px) / 5 - 6px)", top: start * ROW + 3, height: len * ROW - 6 }}
            >
              {label}
            </div>
          ))}
          {b >= 1 && (
            <div
              className="wb-drop-cal absolute rounded-md border-2 border-[#F86A0A] bg-[#FFF1E6] px-1.5 py-1 text-[9.5px] font-bold text-[#9A3412]"
              style={{ left: "calc(40px + (100% - 40px) * 3 / 5 + 3px)", width: "calc((100% - 40px) / 5 - 6px)", top: 1 * ROW + 3, height: 2 * ROW - 6 }}
            >
              9:00a · Grace Kim
              <span className="block font-semibold text-[#C2410C]">Ceiling fans · Sam</span>
            </div>
          )}
        </div>
        {b >= 2 && (
          <div className="wb-toast-in absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-[#1D2E52] px-3 py-2 text-[10.5px] font-semibold text-white">
            <Check className="h-3.5 w-3.5 text-green-300" strokeWidth={3} /> Reminder sent to Grace
          </div>
        )}
      </div>
    </div>
  );
}

function JobScreen({ on }: { on: boolean }) {
  const b = useBeat(on, [500, 1700, 2300, 2900, 3700]);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!on || b < 1) {
      if (!on) setSecs(0);
      return;
    }
    if (b >= 5) {
      setSecs(7800);
      return;
    }
    const t = setInterval(() => setSecs((s) => Math.min(7800, s + 260)), 40);
    return () => clearInterval(t);
  }, [on, b]);
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  return (
    <div>
      <PageHead sub="Grace Kim · Thu, Oct 29 · 9:00a" title="Job #318 · Ceiling fans" right={b >= 5 ? <Chip tone="green">Complete</Chip> : <Chip tone="blue">In progress</Chip>} />
      <div className="relative mt-3 grid grid-cols-[1fr_1.2fr] gap-3">
        <div className="rounded-2xl border border-[#E3E6EC] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">Time clock</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums text-gray-900">
            {hh}:{mm}
            <span className="text-[14px] text-gray-400"> hrs</span>
          </p>
          <span className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold text-white transition-colors duration-500 ${b >= 1 && b < 5 ? "bg-[#B91C1C]" : ""}`} style={b >= 1 && b < 5 ? undefined : { background: NAVY }}>
            {b >= 1 && b < 5 ? (
              <>
                <Square className="h-3 w-3 fill-white" /> Clock out
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-white" /> Clock in
              </>
            )}
          </span>
        </div>
        <div className="rounded-2xl border border-[#E3E6EC] bg-white p-4">
          <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
            Photos <Camera className="h-3.5 w-3.5" />
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {["#C8D6EE", "#E9D8C4", "#CFE3D4"].map((c, k) =>
              b >= 2 + k ? (
                <span key={c} className="wb-pop-in flex aspect-square items-end rounded-lg p-1 text-[8.5px] font-semibold text-gray-700" style={{ background: c }}>
                  {["Before", "Wiring", "Done"][k]}
                </span>
              ) : (
                <span key={c} className="aspect-square rounded-lg border-2 border-dashed border-[#E3E6EC]" />
              ),
            )}
          </div>
        </div>
        {b >= 5 && <Burst />}
      </div>
    </div>
  );
}

function InvoiceScreen({ on, paid }: { on: boolean; paid?: boolean }) {
  const b = useBeat(on, paid ? [500, 1300] : [1400, 2400]);
  const sent = !paid && b >= 2;
  return (
    <div>
      <PageHead
        sub="Grace Kim · Job #318"
        title="Invoice #2490"
        right={paid ? (b >= 1 ? <Chip tone="green">Paid</Chip> : <Chip tone="amber">Awaiting payment</Chip>) : sent ? <Chip tone="amber">Sent</Chip> : <Chip tone="gray">Draft</Chip>}
      />
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
        {[
          ["Ceiling fan install · 2 × $190.00", "$380.00"],
          ["Wiring + new fan-rated box", "$140.00"],
          ["Deposit paid Oct 26", "−$130.00"],
        ].map(([a, v]) => (
          <div key={a} className="flex items-center justify-between border-b border-[#EEF0F3] px-4 py-2.5 text-[12px]">
            <span className="text-gray-700">{a}</span>
            <span className="font-semibold tabular-nums text-gray-900">{v}</span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-[#F8F9FB] px-4 py-3">
          <span className="text-[12px] font-semibold text-gray-900">{paid && b >= 1 ? "Paid by card" : "Balance due"}</span>
          <span className={`text-[16px] font-semibold tabular-nums ${paid && b >= 1 ? "text-[#17703B]" : "text-gray-900"}`}>$390.00</span>
        </div>
        {paid && b >= 1 && (
          <span className="wb-stamp-now pointer-events-none absolute right-[22%] top-[22%] rounded-lg border-[3px] border-[#17A34A] px-3 py-1 text-[26px] font-black tracking-[0.14em] text-[#17A34A]" style={{ transform: "rotate(-12deg)" }}>
            PAID
          </span>
        )}
        {paid && b >= 1 && <Confetti />}
      </div>
      <div className="relative mt-3 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">{paid ? (b >= 2 ? "Collected on this job: $520.00" : "Pay link sent by text and email") : "Due on receipt"}</span>
        {!paid && (
          <>
            <span className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11.5px] font-semibold text-white transition-transform duration-200 ${b === 1 ? "scale-95" : ""}`} style={{ background: NAVY }}>
              <Send className="h-3.5 w-3.5" />
              {sent ? "Sent to Grace" : "Send invoice"}
            </span>
            <Plane go={b >= 1} />
          </>
        )}
      </div>
    </div>
  );
}

function Burst() {
  return (
    <span className="pointer-events-none absolute right-6 top-1 h-16 w-16" aria-hidden>
      {Array.from({ length: 10 }).map((_, k) => (
        <span key={k} className="wb-burst absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full" style={{ background: k % 2 ? "#F86A0A" : "#17A34A", ["--a" as string]: `${k * 36}deg` }} />
      ))}
    </span>
  );
}

function Confetti() {
  const colors = ["#F86A0A", "#0B57D8", "#17A34A", "#FFB020", "#1D2E52"];
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden>
      {Array.from({ length: 22 }).map((_, k) => (
        <span
          key={k}
          className="wb-confetti absolute top-0 h-2 w-1.5 rounded-[1px]"
          style={{ left: `${(k * 37) % 100}%`, background: colors[k % colors.length], animationDelay: `${(k % 7) * 0.06}s`, ["--x" as string]: `${((k * 53) % 60) - 30}px`, ["--r" as string]: `${(k * 71) % 360}deg` }}
        />
      ))}
    </span>
  );
}

/* ── the frame ───────────────────────────────────────────────────────────── */

// The app's own sidebar (as in WBLiveApp): Requests lives under WORK.
const NAV = [
  { icon: Home, label: "Home" },
  { icon: CalendarDays, label: "Schedule" },
  { icon: Users, label: "Clients" },
  { icon: FileText, label: "Quotes" },
  { icon: Briefcase, label: "Jobs" },
  { icon: Receipt, label: "Invoices" },
];

export default function WBAppJourney() {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(STEPS.length - 1);
      return;
    }
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setI((n) => (n + 1) % STEPS.length), i === STEPS.length - 1 ? STEP_MS + 1200 : STEP_MS);
    return () => clearTimeout(t);
  }, [i, run]);

  const s = STEPS[i];
  const pct = (i / (STEPS.length - 1)) * 100;

  return (
    <div ref={ref}>
      {/* the rail */}
      <div className="relative mx-2 sm:mx-6">
        <div className="absolute left-0 right-0 top-[19px] h-[3px] rounded-full bg-[#E3E8F0]" />
        <div className="absolute left-0 top-[19px] h-[3px] rounded-full bg-[#F86A0A] transition-[width] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ width: `${pct}%` }} />
        <ol className="relative flex justify-between">
          {STEPS.map((st, n) => {
            const StIcon = st.icon;
            return (
              <li key={st.key} className="flex w-0 flex-col items-center">
                <button
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={st.label}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-500 ${
                    n === i ? "scale-110 bg-[#F86A0A] text-white shadow-[0_0_0_5px_rgba(248,106,10,0.18)]" : n < i ? "bg-[#0A1428] text-white" : "bg-white text-gray-400 shadow-[0_0_0_1px_rgba(10,20,40,0.12)]"
                  }`}
                >
                  {n < i ? <Check className="h-4 w-4" strokeWidth={3} /> : <StIcon className="h-[18px] w-[18px]" strokeWidth={2.2} />}
                </button>
                <span className={`mt-2.5 whitespace-nowrap text-[12px] font-bold transition-colors duration-500 max-sm:hidden sm:text-[13.5px] ${n === i ? "text-[#0A1428]" : "text-gray-500"}`}>{st.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* the app */}
      <div className="mt-10 select-none text-left" style={FONT} aria-hidden>
        <div className="overflow-hidden rounded-xl bg-[#F4F5F8] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]">
          <div className="flex">
            <aside className="hidden w-[168px] flex-none flex-col border-r border-[#DCE1EA] bg-[#E8ECF3] md:flex">
              <div className="m-2.5 flex h-[44px] items-center justify-center rounded-xl border border-[#D7DCE6] bg-white">
                <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[26px] w-auto" />
              </div>
              <div className="mt-1 border-t border-[#DCE1EA] pt-2">
                {NAV.map(({ icon: Icon, label }) => {
                  const on = label === s.nav;
                  return (
                    <div key={label} className={`relative flex items-center gap-2.5 px-4 py-[7px] text-[12px] transition-colors duration-300 ${on ? "bg-[#D9DFEA] font-semibold text-gray-900" : "text-gray-600"}`}>
                      {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#1D2E52]" />}
                      <Icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
                      {label}
                    </div>
                  );
                })}
                {["WORK", "MONEY", "BUSINESS"].map((g) => {
                  const on = g === "WORK" && s.nav === "Requests";
                  return (
                    <div key={g} className={`flex items-center gap-2 px-4 py-[7px] text-[8.5px] font-semibold tracking-[0.14em] transition-colors duration-300 ${on ? "bg-[#D9DFEA] text-gray-900" : "text-gray-500"}`}>
                      {g}
                      <span className="h-px flex-1 bg-[#D3D9E3]" />
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  );
                })}
              </div>
              <div className="mt-auto border-t border-[#DCE1EA] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1D2E52] text-[9.5px] font-semibold text-white">MD</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-semibold text-gray-900">Mike Delgado</span>
                    <span className="block text-[9px] text-gray-500">Brightwire Electric</span>
                  </span>
                  <ChevronsUpDown className="h-3 w-3 text-gray-400" />
                </div>
              </div>
            </aside>
            <div className="min-w-0 flex-1">
              <div className="flex h-[44px] items-center justify-end gap-2.5 border-b border-[#E4E7ED] px-4">
                <span className="mr-auto hidden w-[220px] items-center gap-2 rounded-lg bg-[#ECEEF2] px-3 py-1.5 text-[11px] text-gray-400 lg:flex">
                  <Search className="h-3 w-3" /> Search
                </span>
                <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: NAVY }}>
                  <Plus className="h-3 w-3" strokeWidth={2.5} /> Create
                </span>
                <span className="hidden items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-800 sm:flex">
                  <MessagesSquare className="h-3 w-3" /> Chat
                </span>
                <Bell className="h-[14px] w-[14px] text-gray-500" />
                <Settings className="h-[14px] w-[14px] text-gray-500" />
              </div>
              <div className="relative h-[330px] overflow-hidden px-5 pt-5 sm:px-7">
                <div key={s.key} className="wb-step-in">
                  {s.key === "req" && <RequestsScreen on={run || i === 0} />}
                  {s.key === "quote" && <QuoteScreen on />}
                  {s.key === "ok" && <ApprovedScreen on />}
                  {s.key === "sched" && <ScheduleScreen on />}
                  {s.key === "done" && <JobScreen on />}
                  {s.key === "inv" && <InvoiceScreen on />}
                  {s.key === "paid" && <InvoiceScreen on paid />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
