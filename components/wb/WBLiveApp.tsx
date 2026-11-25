"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Mic, Plus } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { LiveCard, usd } from "@/components/wb/WBAppJourney";
import WBAppFrame, { BRAND } from "@/components/wb/demos/WBAppFrame";
import "./wb-live.css";

/**
 * The home hero's "live app": the REAL WorkBench Home at a desk as it is now
 * (2026-11-25, the new look): the Live sidebar with what's waiting beside
 * each page, the top bar in the band's deep color, Home on the branded band
 * (greeting with the first name in the company's second color, the day's
 * line, Schedule + New job), then the open page — Talk to Atlas first, Needs
 * you beside Money, Today as a hairline table. For the made-up Brightwire
 * Electric, never a real client. It plays by itself while on screen, using
 * only what the app really does:
 *   1. a booking arrives — the live "New booking" card, and the job lands
 *      in Today with the row's arrival flash,
 *   2. the past-due invoice is paid — the live "Payment received" card,
 *      Collected counts up, Still owed drops, and the past-due row leaves
 *      Needs you.
 * Still, finished state under reduced motion.
 */

const STEP_MS = [1800, 3400, 4600];
const BASE_COLLECTED = 5190.59;
const PAID = 1240;
// October so far (the 6th is today); the rest of the month is still empty
const DAILY = [410, 2216, 0, 804.59, 520, 1240];
const MONTH_DAYS = 31;

type TodayRow = { t: string; who: string; work: string; crew: string; amt?: number; st: [string, Tone]; fresh?: boolean };
type Tone = "good" | "warn" | "bad" | "prim" | "sec" | "muted";

const chipColor: Record<Tone, string> = {
  good: "var(--ds-good)",
  warn: "var(--ds-warn)",
  bad: "var(--ds-bad)",
  prim: "var(--ds-primary)",
  sec: "var(--ds-secondary)",
  muted: "var(--ds-muted)",
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="wbl-chip" style={{ background: chipColor[tone], color: tone === "sec" ? "var(--ds-on-secondary)" : "#fff" }}>
      {children}
    </span>
  );
}

function Section({ title, count, aside, children }: { title: string; count?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="wbl-sec-head">
        <h2 className="wbl-h2">
          <span className="wbl-h2-text">{title}</span>
          {count && <span className="wbl-h2-n">{count}</span>}
        </h2>
        {aside && <div className="wbl-aside">{aside}</div>}
      </div>
      <div style={{ paddingTop: 6 }}>{children}</div>
    </section>
  );
}

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
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
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

  // Home's count-up: the new total rolls up when it lands.
  useEffect(() => {
    if (step !== 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

  const today: TodayRow[] = [
    { t: "9:00 AM", who: "Maria Hernandez", work: "AC disconnect replacement", crew: BRAND.user, amt: 450, st: ["Done", "good"] },
    { t: "10:00 AM", who: "Olivia Park", work: "Ceiling fan install x3", crew: "Sam Ortiz", amt: 520, st: ["On the job", "warn"] },
    { t: "12:00 PM", who: "James Whitfield", work: "EV charger install", crew: "Sam Ortiz", amt: 450, st: ["Booked", "muted"] },
    ...(booked
      ? [{ t: "1:00 PM", who: "Rachel Moore", work: "Panel inspection", crew: "Sam Ortiz", amt: 320, st: ["New", "sec"] as [string, Tone], fresh: true }]
      : []),
    { t: "3:00 PM", who: "Tom Becker", work: "Walkthrough for a panel upgrade", crew: `In person · ${BRAND.user}`, st: ["Visit", "prim"] },
  ];

  const needs = [
    ...(paid ? [] : [{ n: 1, a: "Past-due invoice", go: "Send a reminder", bad: true }]),
    { n: 3, a: "New leads", go: "Reach out", bad: false },
    { n: 2, a: "New requests", go: "Review", bad: false },
    { n: 1, a: "Approved quote", go: "Make it a job", bad: false },
  ];
  const needsTotal = needs.reduce((n, r) => n + r.n, 0);

  const days = DAILY.map((v, i) => (paid && i === DAILY.length - 1 ? v + PAID : v));
  const max = Math.max(...days, 1);

  const toast =
    step === 1 ? (
      <LiveCard key="b" kind="booking" title="New booking" sub="Rachel Moore — Panel inspection, Tue, Oct 6, 1:00 PM" />
    ) : step === 2 ? (
      <LiveCard key="p" kind="payment" title={`Payment received · ${usd(PAID)}`} sub="Derek Olsen" />
    ) : null;

  return (
    <div ref={ref} className="pointer-events-none" aria-hidden>
      <WBAppFrame real nav="Home" height={743} designWidth={1280} deepBar toast={toast}>
        {/* the band: the greeting, the day's line, Schedule + New job */}
        <div className="wbl-band">
          <div className="wbl-band-row">
            <div className="min-w-0">
              <p className="wbl-eyebrow">Tuesday, October 6</p>
              <h1 className="wbl-title">
                Good afternoon, <span className="wbl-acc">Mike</span>
              </h1>
              <p className="wbl-note">A full Tuesday: {booked ? 4 : 3} jobs and a walkthrough, the first at 9:00.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <span className="wbl-btn wbl-btn-ghost">
                <CalendarDays size={17} strokeWidth={2.2} />
                Schedule
              </span>
              <span className="wbl-btn wbl-btn-pri">
                <Plus size={17} strokeWidth={2.2} />
                New job
              </span>
            </div>
          </div>
        </div>

        {/* the open page */}
        <div className="wbl-body">
          <div className="wbl-atlas">
            <AtlasMark size={44} accent={BRAND.secondary} className="shrink-0 rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <p className="wbl-atlas-title">Talk to Atlas</p>
              <p className="wbl-atlas-line">
                <span className="wbl-atlas-try">Try</span> “Put a job on the calendar for Thursday at 9.”
              </p>
            </div>
            <span className="wbl-atlas-type">or type</span>
            <span className="wbl-atlas-mic">
              <Mic size={22} strokeWidth={2.3} />
            </span>
          </div>

          <div className="wbl-split">
            <Section title="Needs you" count={String(needsTotal)}>
              {needs.map((r) => (
                <div key={r.a} className="wbl-row">
                  <span className={`wbl-num ${r.bad ? "is-bad" : ""}`}>{r.n}</span>
                  <span className="wbl-row-title">{r.a}</span>
                  {r.bad && <Chip tone="bad">Overdue</Chip>}
                  <span className="wbl-go">
                    {r.go}
                    <ChevronRight size={15} strokeWidth={2.4} />
                  </span>
                </div>
              ))}
            </Section>
            <Section title="Money">
              <div style={{ padding: "12px 0" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="wbl-label">Collected in October</span>
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--ds-good)" }}>
                    +{paid ? 31 : 12}% vs. last month
                  </span>
                </div>
                <p className="wbl-big">{usd(collected)}</p>
                <div className="wbl-bars" aria-hidden>
                  {Array.from({ length: MONTH_DAYS }, (_, i) => {
                    const v = days[i] ?? 0;
                    const isToday = i === DAILY.length - 1;
                    return (
                      <i
                        key={i}
                        className={isToday ? "is-today" : i >= DAILY.length || v <= 0 ? "is-empty" : ""}
                        style={{ height: `${v > 0 ? Math.max(6, (v / max) * 100) : 4}%` }}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="wbl-row" style={{ minHeight: 64 }}>
                <span className="min-w-0 flex-1">
                  <span className="wbl-label block">Still owed</span>
                  <span className="mt-0.5 block text-[22px] font-bold tabular-nums tracking-[-0.03em] text-[color:var(--ds-ink)]">
                    {usd(paid ? 1379.65 : 2619.65)}
                  </span>
                </span>
                <span className="text-right">
                  {!paid && (
                    <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ds-bad)" }}>
                      1 past due
                    </span>
                  )}
                  <span className="block text-[13px] text-[color:var(--ds-muted)]">{paid ? "1 client" : "2 clients"}</span>
                </span>
              </div>
            </Section>
          </div>

          <Section
            title="Today"
            count={`${booked ? 4 : 3} jobs · 1 visit`}
            aside={
              <span className="wbl-go">
                Open schedule
                <ChevronRight size={15} strokeWidth={2.4} />
              </span>
            }
          >
            <table className="wbl-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Time</th>
                  <th>Client</th>
                  <th>Work</th>
                  <th>Who</th>
                  <th className="r">Amount</th>
                  <th style={{ width: 120 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {today.map((j) => (
                  <tr key={j.who} className={j.fresh && step === 1 ? "wbl-in" : undefined}>
                    <td className="wbl-strong tabular-nums">{j.t}</td>
                    <td className="wbl-strong">{j.who}</td>
                    <td>{j.work}</td>
                    <td style={{ color: "var(--ds-muted)" }}>{j.crew}</td>
                    <td className="r tabular-nums">{j.amt ? usd(j.amt) : <span style={{ color: "var(--ds-faint)" }}>—</span>}</td>
                    <td>
                      <Chip tone={j.st[1]}>{j.st[0]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </WBAppFrame>
    </div>
  );
}
