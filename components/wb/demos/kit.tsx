"use client";

import { useEffect, useRef, useState } from "react";
import { BatteryFull, Check, Send, Signal, Wifi } from "lucide-react";
import "./demos.css";

/**
 * Shared bits for the coded app-screen demos (components/wb/demos). Copied
 * from WBAppJourney (which keeps its internals private) so these screens use
 * the same type, colors, chips and celebration moments as the rest of the
 * site's copies of the app. Demo company: Brightwire Electric only.
 */

export const NAVY = "#1D2E52";
/** Brightwire Electric's primary (lib/demo-company.ts brandColor). */
export const BRAND_PRIMARY = "#10244A";
export const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const firstName = (name: string) => name.split(" ")[0];
export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A beat inside a step: 0 on arrival, then 1, 2, 3 on a timer (as in WBAppJourney). */
export function useBeat(active: boolean, times: number[]) {
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

/**
 * The demo's clock. While the element is on screen (30% visible) it plays
 * the beats (b = 0, then 1..n at `times`), holds, and starts over every
 * `cycleMs`. Off screen it stops. Under reduced motion it rests on the
 * final state (b = n) and never moves. `loop` counts the cycles, for keys
 * that should re-run an entry animation each time round.
 */
export function useDemoLoop(times: number[], cycleMs: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [b, setB] = useState(0);
  const [loop, setLoop] = useState(0);
  const key = times.join(",") + "|" + cycleMs;
  useEffect(() => {
    if (prefersReduced()) {
      setB(times.length);
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    let on = false;
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const start = () => {
      clear();
      setB(0);
      setLoop((l) => l + 1);
      times.forEach((ms, k) => timers.push(setTimeout(() => setB(k + 1), ms)));
      timers.push(setTimeout(start, cycleMs));
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !on) {
          on = true;
          start();
        } else if (!e.isIntersecting && on) {
          on = false;
          clear();
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ref, b, loop };
}

/** A number that rolls to its new value (ease-out), instant under reduced motion. */
export function useRoll(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (prefersReduced() || from.current === target) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {sub && <p className="truncate text-[10.5px] text-gray-500">{sub}</p>}
        <p className="truncate text-[19px] font-semibold text-gray-900">{title}</p>
      </div>
      {right}
    </div>
  );
}

export type ChipTone = "blue" | "amber" | "green" | "gray" | "orange";
/**
 * The app's status chip (components/StatusChip → .ds-chip in app/ds.css):
 * a colored dot and plain words. blue = the company primary, orange = the
 * secondary, green / amber = the fixed good / warn tones, gray = neutral.
 */
export function Chip({ tone, children, className = "" }: { tone: ChipTone; children: React.ReactNode; className?: string }) {
  const c = { blue: "ds-chip-primary", amber: "ds-chip-warn", green: "ds-chip-good", gray: "ds-chip-neutral", orange: "ds-chip-secondary" }[tone];
  return <span className={`ds-chip flex-none ${c} ${className}`}>{children}</span>;
}

/** The app's card (.ds-card: white, 20px corners, hairline ring). */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ds-card overflow-hidden bg-white ${className}`}>{children}</div>;
}

export function Plane({ go, className = "right-3 top-1/2" }: { go: boolean; className?: string }) {
  return go ? <Send className={`wb-plane pointer-events-none absolute h-4 w-4 text-[#0B57D8] ${className}`} /> : null;
}

export function Burst({ className = "right-6 top-1" }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute h-16 w-16 ${className}`} aria-hidden>
      {Array.from({ length: 10 }).map((_, k) => (
        <span key={k} className="wb-burst absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full" style={{ background: k % 2 ? "#F86A0A" : "#17A34A", ["--a" as string]: `${k * 36}deg` }} />
      ))}
    </span>
  );
}

export function Confetti() {
  // components/Celebration.tsx's colors (the app's win-moment confetti)
  const colors = ["#22C55E", "#16A34A", "#4ADE80", "#FBBF24", "#0C0F0C"];
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

/**
 * The inked stamp the client pages press onto a document (.c-stamp in
 * app/client.css: 2.5px border, wide-tracked caps, -6deg) — APPROVED /
 * PAID / SIGNED. green = the good tone, navy = the company's color.
 */
export function Stamp({ text, className = "", size = 22, tone = "green" }: { text: string; className?: string; size?: number; tone?: "green" | "navy" }) {
  const c = tone === "green" ? "#15803D" : BRAND_PRIMARY;
  return (
    <span
      className={`wb-stamp-now pointer-events-none absolute whitespace-nowrap rounded-[6px] border-[2.5px] bg-white/80 font-bold uppercase ${className}`}
      style={{ rotate: "-6deg", fontSize: size * 0.75, padding: `${size * 0.2}px ${size * 0.65}px`, letterSpacing: "0.22em", borderColor: c, color: c, opacity: 0.9 }}
    >
      {text}
    </span>
  );
}

/**
 * The app's toast (app/platform/schedule/UndoToast.tsx): a gray-900 bar,
 * 14px corners, white words. `sub` is its second, quieter line.
 */
export function Toast({ children, sub, className = "bottom-3 right-3" }: { children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={`wb-toast-in absolute z-20 rounded-[14px] bg-gray-900 px-3.5 py-2 text-[11px] text-white shadow-[0_10px_30px_rgba(9,13,19,0.3)] ${className}`}>
      <p className="font-medium leading-snug">{children}</p>
      {sub && <p className="text-[10px] leading-snug opacity-75">{sub}</p>}
    </div>
  );
}

/** A client's signature drawing itself on a line. */
export function Signature({ on, className = "h-[56px] w-full" }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 240 70" className={className} aria-hidden>
      {on && (
        <path
          d="M12 48 C 22 18, 38 18, 34 44 C 31 60, 22 52, 30 40 C 40 26, 52 30, 56 44 C 60 54, 66 40, 74 36 C 82 32, 80 50, 90 46 C 100 42, 104 30, 112 34 C 120 38, 116 52, 128 48 C 140 44, 146 28, 158 32 C 170 36, 168 50, 182 44 C 196 38, 210 30, 228 36"
          pathLength={1}
          stroke={NAVY}
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
          className="wb-sign"
        />
      )}
      <line x1="8" y1="62" x2="232" y2="62" stroke="#D5DAE3" strokeWidth="1.5" />
    </svg>
  );
}

/** A round checklist tick. */
export function Tick({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full border-2 transition-colors duration-300 ${on ? "border-[#17A34A] bg-[#17A34A] text-white" : "border-[#CBD2DD] bg-white text-transparent"}`}
      style={{ width: size, height: size }}
    >
      {on && <Check key="t" className="wb-demo-tick" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={3.4} />}
    </span>
  );
}

/** An iOS-style switch. */
export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-flex h-[20px] w-[34px] flex-none rounded-full transition-colors duration-300 ${on ? "bg-[#17A34A]" : "bg-[#D5DAE3]"}`}>
      <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[left] duration-300 ${on ? "left-[16px]" : "left-[2px]"}`} />
    </span>
  );
}

/**
 * An upright phone (straight on, never tilted or fanned). A coded screen
 * goes inside; the status bar and island are drawn here.
 */
export function Phone({ children, width = 280, height = 560, className = "", screen = "bg-white" }: { children: React.ReactNode; width?: number; height?: number; className?: string; screen?: string }) {
  return (
    <div
      className={`relative flex-none rounded-[2.6rem] bg-[#0A1428] p-[9px] shadow-[0_0_0_1px_rgba(10,20,40,0.2),0_30px_60px_-28px_rgba(10,20,40,0.55)] ${className}`}
      style={{ width, height }}
    >
      <div className={`ds relative flex h-full w-full flex-col overflow-hidden rounded-[2.05rem] ${screen}`}>
        <div className="flex h-[38px] flex-none items-center justify-between px-6 pt-1 text-[11.5px] font-semibold text-gray-900">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" strokeWidth={2.6} />
            <Wifi className="h-3 w-3" strokeWidth={2.6} />
            <BatteryFull className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        </div>
        <div className="absolute left-1/2 top-[9px] h-[22px] w-[80px] -translate-x-1/2 rounded-full bg-[#0A1428]" />
        <div className="relative min-h-0 flex-1">{children}</div>
        <div className="flex h-[18px] flex-none items-center justify-center">
          <span className="h-[4px] w-[96px] rounded-full bg-gray-900/80" />
        </div>
      </div>
    </div>
  );
}

/**
 * Draws its child at `width` px (a 390-wide phone page, a 1040-wide
 * desktop) and zooms it to the width it is given, so a screen keeps the
 * app's real proportions at any size.
 */
export function Fit({ width = 390, children, className = "" }: { width?: number; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setZ(w / width);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={`w-full ${className}`}>
      <div style={{ zoom: z ?? 0.7, width, opacity: z === null ? 0 : 1 } as React.CSSProperties}>{children}</div>
    </div>
  );
}

/**
 * True when the element is narrower than `min` px — a desktop app screen
 * drawn smaller than that can't be read, so demos show the phone app there.
 */
export function useNarrow(min: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setNarrow(el.getBoundingClientRect().width < min);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return { ref, narrow };
}

/** Parse "9:00a", "9a", "9:00 AM", "1:30 pm", "13:00" into minutes from midnight. */
export function parseTime(s: string): number {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)?\.?m?\.?$/);
  if (!m) return 9 * 60;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}

/** 660 → "11:00a" (the app's short form). */
export function fmtTime(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const mm = String(min % 60).padStart(2, "0");
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mm}${h24 < 12 ? "a" : "p"}`;
}
