"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, MapPin, Mic, Plus } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import {
  AppCanvas,
  AppWindow,
  BW,
  InfoDot,
  LiveCard,
  usd,
} from "@/components/wb/WBAppJourney";

/**
 * The home hero's "live app": a copy of the REAL WorkBench dashboard at
 * desktop size (app/platform/dashboard/page.tsx, desktop tree: greeting
 * header with Schedule / New job, Talk to Atlas, the three stats, Today and
 * Needs you) in the real AppShell, for the made-up Brightwire Electric
 * (never a real client). 2026-11-20 fidelity pass: drawn with the app's own
 * classes (.ds, ds-card, ds-row, ds-count, ds-chip) and scaled to fit.
 * It works by itself on a loop while on screen, using only what the app
 * really shows:
 *   1. a booking arrives — the live "New booking" card, and it is in Today,
 *   2. the past-due invoice is paid — the live "Payment received" card,
 *      Collected counts up (the dashboard's CountUp), Outstanding drops and
 *      the past-due row leaves Needs you.
 * Still, finished state under reduced motion.
 */

const STEP_MS = [1800, 3400, 4600];
const BASE_COLLECTED = 5190.59;
const PAID = 1240;
const DAILY = [0, 410, 2216, 0, 0, 1240, 520, 0, 804.59];

export default function WBLiveApp() {
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState(BASE_COLLECTED);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(2);
      setCollected(BASE_COLLECTED + PAID);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => (visible.current = e.isIntersecting),
      { threshold: 0.2 },
    );
    if (ref.current) io.observe(ref.current);
    let timer: ReturnType<typeof setTimeout>;
    let s = 0;
    const tick = () => {
      if (!visible.current) {
        timer = setTimeout(tick, 500);
        return;
      }
      s = (s + 1) % 3;
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

  // The dashboard's CountUp: the new total counts up when it lands.
  useEffect(() => {
    if (
      step !== 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const start = performance.now();
    let raf = 0;
    const run = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setCollected(BASE_COLLECTED + PAID * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const booked = step >= 1;
  const paid = step >= 2;

  const today: {
    t: string;
    who: string;
    sub: string;
    amt?: number;
    visit?: boolean;
    fresh?: boolean;
  }[] = [
    {
      t: "9:00a",
      who: "Maria Hernandez — AC disconnect replacement",
      sub: BW.owner,
      amt: 450,
    },
    {
      t: "10:00a",
      who: "Olivia Park — Ceiling fan install x3",
      sub: "Sam Ortiz",
      amt: 520,
    },
    {
      t: "12:00p",
      who: "James Whitfield — EV charger install",
      sub: "Sam Ortiz",
      amt: 450,
    },
    ...(booked
      ? [
          {
            t: "1:00p",
            who: "Rachel Moore — Panel inspection",
            sub: "Sam Ortiz",
            amt: 320,
            fresh: true,
          },
        ]
      : []),
    {
      t: "3:00p",
      who: "Tom Becker — Walkthrough for panel upgrade",
      sub: `In-person · ${BW.owner}`,
      visit: true,
    },
  ];

  const needs = [
    ...(paid
      ? []
      : [{ n: 1, a: "Past-due invoice", b: "Send a reminder", bad: true }]),
    { n: 3, a: "New leads", b: "Reach out" },
    { n: 2, a: "New requests", b: "Review & send a quote" },
    { n: 1, a: "Changes requested", b: "Update the quote" },
    { n: 1, a: "Approved quote", b: "Convert to a job" },
  ];

  const daily = paid
    ? [...DAILY.slice(0, -1), DAILY[DAILY.length - 1] + PAID]
    : DAILY;
  const max = Math.max(...daily, 1);
  const bw = (100 - 1.5 * (daily.length - 1)) / daily.length;

  const toast =
    step === 1 ? (
      <LiveCard
        key="b"
        kind="booking"
        title="New booking"
        sub="Rachel Moore — Panel inspection, Tue, Oct 6, 1:00 PM"
      />
    ) : step === 2 ? (
      <LiveCard
        key="p"
        kind="payment"
        title={`Payment received · ${usd(PAID)}`}
        sub="Derek Olsen"
      />
    ) : null;

  return (
    <div ref={ref}>
      <AppCanvas height={800}>
        {(w) => (
          <div style={{ width: w, height: 800 }}>
            <AppWindow
              nav="Home"
              counts={{ Invoices: paid ? 0 : 1, Requests: 2 }}
              bellDot
              toast={toast}
            >
              <div className="mx-auto w-full max-w-6xl px-8 pb-10 pt-8">
                {/* PageHeader */}
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="ds-eyebrow ds-eyebrow-plain">
                      Tuesday, October 6
                    </p>
                    <h1
                      className="ds-title mt-1 flex items-center gap-2"
                      style={{ fontSize: 30 }}
                    >
                      <span>
                        Good evening,{" "}
                        <span style={{ color: "var(--ds-primary)" }}>Mike</span>
                      </span>
                      <InfoDot />
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex gap-2">
                      <span className="ds-btn ds-btn-outline">
                        <CalendarDays size={17} strokeWidth={2.2} />
                        Schedule
                      </span>
                      <span className="ds-btn ds-btn-primary">
                        <Plus size={17} strokeWidth={2.2} />
                        New job
                      </span>
                    </span>
                  </div>
                </div>

                {/* Talk to Atlas */}
                <div className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-3.5 py-3 text-left shadow-sm">
                  <AtlasMark
                    size={40}
                    accent={BW.secondary}
                    className="shrink-0 rounded-[12px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[color:var(--ds-ink)]">
                      Talk to Atlas
                    </span>
                    <span className="block truncate text-[12.5px] text-[color:var(--ds-ink-2)]">
                      Say what you need — schedule, quotes, clients, follow-ups.
                      Hands-free.
                    </span>
                  </span>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: "var(--wb-accent, var(--ds-primary))",
                      color: "var(--wb-on-accent, #ffffff)",
                    }}
                  >
                    <Mic size={18} />
                  </span>
                </div>

                {/* the three stats */}
                <div className="mt-7 grid grid-cols-3 gap-4">
                  <div className="ds-card p-5">
                    <p className="ds-label flex items-center gap-1">
                      Collected
                      <InfoDot />
                    </p>
                    <p className="ds-value mt-2">{usd(collected)}</p>
                    <p className="ds-small mt-1.5">this month</p>
                    <svg
                      viewBox="0 0 100 24"
                      className="mt-4 h-8 w-full"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      {daily.map((v, i) => {
                        const h = v > 0 ? Math.max((v / max) * 22, 2) : 1;
                        const last = i === daily.length - 1;
                        return (
                          <rect
                            key={i}
                            x={i * (bw + 1.5)}
                            y={24 - h}
                            width={bw}
                            height={h}
                            rx={0.75}
                            fill={
                              last ? "var(--ds-secondary)" : "var(--ds-primary)"
                            }
                            opacity={v > 0 ? (last ? 1 : 0.8) : 0.15}
                            style={{ transition: "y 0.7s, height 0.7s" }}
                          />
                        );
                      })}
                    </svg>
                  </div>
                  <div className="ds-card p-5">
                    <p className="ds-label flex items-center gap-1">
                      Outstanding
                      <InfoDot />
                    </p>
                    <p
                      className="ds-value mt-2"
                      style={{ color: "var(--ds-bad)" }}
                    >
                      {usd(paid ? 1379.65 : 2619.65)}
                    </p>
                    <p className="ds-small mt-1.5">
                      {paid ? "1 client owes you" : "2 clients owe you"}
                    </p>
                  </div>
                  <div className="ds-card p-5">
                    <p className="ds-label flex items-center gap-1">
                      Booked this week
                      <InfoDot />
                    </p>
                    <p className="ds-value mt-2">{usd(booked ? 7615 : 7295)}</p>
                    <p className="ds-small mt-1.5">
                      {booked ? 14 : 13} jobs scheduled
                    </p>
                  </div>
                </div>

                {/* Today + Needs you */}
                <div className="mt-8 grid grid-cols-[1.45fr_1fr] items-start gap-6">
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="ds-h2 flex items-center gap-1.5">
                        Today
                        <span className="ds-small ml-1 font-normal">
                          · {booked ? 4 : 3} jobs · 1 appointment
                        </span>
                      </h2>
                      <span className="ds-link inline-flex items-center gap-1 text-[13.5px]">
                        Open schedule <span aria-hidden>→</span>
                      </span>
                    </div>
                    <div className="ds-card ds-divide overflow-hidden">
                      {today.map((j) => (
                        <div
                          key={j.who}
                          className="ds-row"
                          style={
                            j.fresh && step === 1
                              ? {
                                  animation:
                                    "listIn 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                                }
                              : undefined
                          }
                        >
                          <span className="flex w-[74px] shrink-0 items-center gap-2.5">
                            <span className="ds-num w-12 text-right text-[12.5px] font-semibold text-[color:var(--ds-ink-2)]">
                              {j.t}
                            </span>
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                              style={{
                                background: j.visit
                                  ? "var(--ds-secondary-soft)"
                                  : "var(--ds-primary-soft)",
                              }}
                            >
                              {j.visit ? (
                                <MapPin
                                  size={12}
                                  strokeWidth={2.4}
                                  style={{ color: "var(--ds-secondary)" }}
                                />
                              ) : (
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: "var(--ds-primary)" }}
                                />
                              )}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                              {j.who}
                            </span>
                            <span className="ds-small mt-0.5 block truncate">
                              {j.sub}
                            </span>
                          </span>
                          {j.amt ? (
                            <span className="ds-num shrink-0 text-[13.5px] font-semibold text-[color:var(--ds-ink)]">
                              {usd(j.amt)}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="ds-h2 flex items-center gap-1.5">
                        Needs you
                        <InfoDot />
                      </h2>
                    </div>
                    <div className="ds-card ds-divide overflow-hidden">
                      {needs.map((r) => (
                        <div key={r.a} className="ds-row">
                          <span
                            key={r.n}
                            className={`ds-count ${r.bad ? "ds-count-bad" : ""}`}
                          >
                            {r.n}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                              {r.a}
                            </span>
                            <span className="ds-small mt-0.5 block truncate">
                              {r.b}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {r.bad && (
                              <span className="ds-chip ds-chip-bad">
                                Overdue
                              </span>
                            )}
                            <ChevronRight
                              size={16}
                              className="text-[color:var(--ds-faint)]"
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </AppWindow>
          </div>
        )}
      </AppCanvas>
    </div>
  );
}
