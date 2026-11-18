"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronRight, FileText, Home, Hammer, MessageSquare, Receipt, Users, Zap } from "lucide-react";

/**
 * The home hero's "live app" (David 2026-11-18): a small coded copy of the
 * WorkBench dashboard for the made-up Brightwire Electric (never a real
 * client) that works by itself on a loop:
 *   1. a new online booking slides into Today,
 *   2. the past-due invoice flips to Paid and Collected counts up,
 *   3. the next client gets an on-my-way text (toast).
 * It only runs while on screen, and shows the finished state, still, under
 * reduced motion. Markup mirrors the real app's dashboard (sidebar, three
 * money cards, Today, Needs you) closely enough to read as the product.
 */

const STEP_MS = [1600, 2600, 2400, 4200]; // booking, paid, text, hold → reset
const BASE_COLLECTED = 5190.59;
const PAID_AMOUNT = 1240;

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function WBLiveApp() {
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState(BASE_COLLECTED);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(3);
      setCollected(BASE_COLLECTED + PAID_AMOUNT);
      return;
    }
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
    if (ref.current) io.observe(ref.current);
    let timer: ReturnType<typeof setTimeout>;
    let s = 0;
    const tick = () => {
      if (!visible.current) {
        timer = setTimeout(tick, 500);
        return;
      }
      s = (s + 1) % 4;
      setStep(s);
      if (s === 0) setCollected(BASE_COLLECTED);
      timer = setTimeout(tick, STEP_MS[s]);
    };
    timer = setTimeout(tick, STEP_MS[0]);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  // Collected counts up when the invoice is paid.
  useEffect(() => {
    if (step !== 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const start = performance.now();
    let raf = 0;
    const run = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      setCollected(BASE_COLLECTED + PAID_AMOUNT * eased);
      if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const booked = step >= 1;
  const paid = step >= 2;
  const texted = step >= 3;

  const nav = [
    { icon: Home, label: "Home", on: true },
    { icon: CalendarDays, label: "Schedule" },
    { icon: Users, label: "Clients" },
    { icon: FileText, label: "Quotes" },
    { icon: Hammer, label: "Jobs" },
    { icon: Receipt, label: "Invoices" },
  ];

  const today = [
    { t: "8:00a", who: "Maria Hernandez", what: "AC disconnect replacement", amt: "$450.00", crew: "MD" },
    { t: "10:00a", who: "Olivia Park", what: "Ceiling fan install x3", amt: "$520.00", crew: "SO" },
    { t: "12:00p", who: "James Whitfield", what: "EV charger install", amt: "$450.00", crew: "SO" },
  ];

  return (
    <div ref={ref} className="relative select-none text-left" aria-hidden>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_40px_90px_-30px_rgba(10,20,40,0.45),0_0_0_1px_rgba(10,20,40,0.04)]">
        {/* browser bar */}
        <div className="flex items-center gap-3 border-b border-gray-200 bg-[#F3F5F8] px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </span>
          <span className="mx-auto rounded-md bg-white px-10 py-1 text-[11px] font-semibold text-gray-400 ring-1 ring-inset ring-gray-200">workbenchfsm.com/app</span>
          <span className="w-[42px]" />
        </div>

        <div className="flex">
          {/* sidebar */}
          <aside className="hidden w-[170px] flex-none border-r border-gray-200 bg-[#F6F7F9] p-3 md:block">
            <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#10244A]">
                <Zap className="h-3.5 w-3.5 text-[#FFC53D]" fill="#FFC53D" strokeWidth={0} />
              </span>
              <span className="text-[12px] font-extrabold leading-tight text-[#10244A]">Brightwire<span className="block text-[8px] font-bold tracking-[0.18em] text-gray-400">ELECTRIC CO.</span></span>
            </div>
            <ul className="mt-4 space-y-0.5">
              {nav.map(({ icon: Icon, label, on }) => (
                <li key={label} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${on ? "bg-white text-gray-900 ring-1 ring-gray-200" : "text-gray-500"}`}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {label}
                  {label === "Invoices" && !paid && <span className="ml-auto rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">1</span>}
                </li>
              ))}
            </ul>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1 bg-white p-4 sm:p-6">
            <p className="text-[10.5px] font-semibold text-gray-400">Tuesday, October 6</p>
            <p className="text-[19px] font-extrabold text-gray-900 sm:text-[21px]">
              Good morning, <span className="text-[#0B57D8]">Mike</span>
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
              <div className={`rounded-lg border p-3 transition-colors duration-500 ${paid ? "border-green-200 bg-green-50/60" : "border-gray-200"}`}>
                <p className="text-[10px] font-semibold text-gray-400">Collected</p>
                <p key={paid ? "p" : "u"} className={`text-[15px] font-extrabold tabular-nums text-gray-900 sm:text-[18px] ${step === 2 ? "wb-pop" : ""}`}>{money(collected)}</p>
                <p className="text-[9.5px] text-gray-400">this month</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-[10px] font-semibold text-gray-400">Outstanding</p>
                <p className={`text-[15px] font-extrabold tabular-nums sm:text-[18px] ${paid ? "text-gray-900" : "text-red-600"}`}>{money(paid ? 1379.65 : 2619.65)}</p>
                <p className="text-[9.5px] text-gray-400">{paid ? "1 client owes you" : "2 clients owe you"}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-[10px] font-semibold text-gray-400">Booked this week</p>
                <p className="text-[15px] font-extrabold tabular-nums text-gray-900 sm:text-[18px]">{money(booked ? 7615 : 7295)}</p>
                <p className="text-[9.5px] text-gray-400">{booked ? "14" : "13"} jobs scheduled</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="mb-1.5 text-[11.5px] font-extrabold text-gray-900">Today</p>
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                  {booked && (
                    <li key={`b${step === 1 ? "n" : "o"}`} className={`flex items-center gap-2.5 bg-orange-50/60 px-3 py-2 ${step === 1 ? "wb-row-in" : ""}`}>
                      <span className="w-10 text-[10px] font-bold text-[#F86A0A]">New</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-bold text-gray-900">Rachel Moore — Panel inspection</span>
                        <span className="block text-[9.5px] text-gray-500">Booked online · Sat 9:00 AM</span>
                      </span>
                      <span className="text-[11px] font-bold tabular-nums text-gray-900">$320.00</span>
                    </li>
                  )}
                  {today.map((j) => (
                    <li key={j.who} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="w-10 text-[10px] font-semibold text-gray-500">{j.t}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-bold text-gray-900">
                          {j.who} — {j.what}
                        </span>
                        <span className="block text-[9.5px] text-gray-500">Crew {j.crew}</span>
                      </span>
                      <span className="text-[11px] font-bold tabular-nums text-gray-900">{j.amt}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden sm:block">
                <p className="mb-1.5 text-[11.5px] font-extrabold text-gray-900">Needs you</p>
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                  <li className={`flex items-center gap-2.5 px-3 py-2 transition-colors duration-500 ${paid ? "bg-green-50/70" : ""}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${paid ? "bg-green-600 text-white" : "bg-red-50 text-red-600"}`}>
                      {paid ? <Check className="h-3 w-3" strokeWidth={3} /> : "1"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold text-gray-900">Invoice #2481 · Derek Olsen</span>
                      <span className="block text-[9.5px] text-gray-500">{paid ? `${money(PAID_AMOUNT)} paid by card` : "Past due · send a reminder"}</span>
                    </span>
                    <span
                      key={paid ? "paid" : "due"}
                      className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold ${paid ? "wb-pop bg-green-600 text-white" : "bg-red-50 text-red-600"}`}
                    >
                      {paid ? "Paid" : "Overdue"}
                    </span>
                  </li>
                  {[
                    { n: 3, a: "New leads", b: "Reach out" },
                    { n: 2, a: "New requests", b: "Review & send a quote" },
                    { n: 1, a: "Approved quote", b: "Convert to a job" },
                  ].map((r) => (
                    <li key={r.a} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-700">{r.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold text-gray-900">{r.a}</span>
                        <span className="block text-[9.5px] text-gray-500">{r.b}</span>
                      </span>
                      <ChevronRight className="h-3 w-3 text-gray-300" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* the text going out */}
      {texted && (
        <div className="wb-toast-in absolute -bottom-5 right-4 flex w-[290px] items-start gap-3 rounded-xl bg-[#0A1428] p-3.5 text-white shadow-[0_24px_50px_-16px_rgba(10,20,40,0.6)] sm:right-8">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#0B57D8]">
            <MessageSquare className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span>
            <span className="block text-[12px] font-extrabold">Text sent to Olivia Park</span>
            <span className="block text-[11px] leading-snug text-blue-100/80">&ldquo;Hi Olivia, Sam from Brightwire Electric is on the way. See you around 10:00.&rdquo;</span>
          </span>
        </div>
      )}
    </div>
  );
}
