"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { INTEGRATIONS } from "@/components/wb/WBIntegrations";
import { MARK_BAR, MARK_LEG_LEFT, MARK_LEG_RIGHT, MARK_ORANGE, MARK_ROUND, MARK_W, MARK_WHITE } from "@/lib/brand-mark";

/**
 * "Works with", round 5 (David 2026-11-19: the ring with flowing dots was
 * "a little cheesy"; keep the popping-in-boxes vibe, Railway-style). A
 * calm grid of solid tiles with the WorkBench mark in the middle. Most
 * tiles hold a logo, a few sit empty; every moment one logo pops out of its
 * tile and a waiting one pops into an empty tile, so the grid is always
 * quietly changing. Same list as the slider (INTEGRATIONS in
 * WBIntegrations.tsx: real logos only, only what WorkBench connects to
 * today). Still under reduced motion.
 */

type It = (typeof INTEGRATIONS)[number];
const COLS = 5;
const ROWS = 3;
const HUB = 7; // the middle tile
const CELLS = COLS * ROWS;

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} aria-hidden>
      {[
        [MARK_W, MARK_WHITE],
        [MARK_BAR, MARK_WHITE],
        [MARK_LEG_LEFT, MARK_ORANGE],
        [MARK_LEG_RIGHT, MARK_ORANGE],
      ].map(([pts, fill]) => (
        <polygon key={pts} points={pts} fill={fill} stroke={fill} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function Logo({ it }: { it: It }) {
  const badge = it.logo.endsWith("-badge.svg");
  return (
    <Image src={it.logo} alt="" width={badge ? 120 : 44} height={badge ? 40 : 44} unoptimized className={badge ? "h-auto w-[86%]" : "h-[40%] w-auto max-w-[52%]"} />
  );
}

// Start: logos in these cells, the rest empty.
const START: (number | null)[] = Array.from({ length: CELLS }, () => null);
[0, 2, 4, 5, 9, 10, 12, 14, 1].forEach((cell, k) => (START[cell] = k));

export default function WBIntegrationsHub() {
  const ref = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<(number | null)[]>(START);
  const [fresh, setFresh] = useState<number | null>(null);
  const [gone, setGone] = useState<{ cell: number; v: number } | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !t) {
        t = setInterval(() => {
          setCells((cur) => {
            const full = cur.map((v, k) => (v !== null && k !== HUB ? k : -1)).filter((k) => k >= 0);
            const empty = cur.map((v, k) => (v === null && k !== HUB ? k : -1)).filter((k) => k >= 0);
            const waiting = INTEGRATIONS.map((_, k) => k).filter((k) => !cur.includes(k));
            if (!full.length || !empty.length) return cur;
            const out = full[Math.floor(Math.random() * full.length)];
            const into = empty[Math.floor(Math.random() * empty.length)];
            const next = [...cur];
            const coming = waiting.length ? waiting[Math.floor(Math.random() * waiting.length)] : next[out];
            setGone({ cell: out, v: next[out] as number });
            next[out] = null;
            next[into] = coming;
            setFresh(into);
            return next;
          });
        }, 1500);
      }
      if (!e.isIntersecting && t) {
        clearInterval(t);
        t = undefined;
      }
    }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      if (t) clearInterval(t);
    };
  }, []);

  return (
    <div ref={ref}>
      <ul className="sr-only">
        {INTEGRATIONS.map((it) => (
          <li key={it.name}>
            {it.name}: {it.note}
          </li>
        ))}
      </ul>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} aria-hidden>
        {cells.map((v, k) => {
          if (k === HUB) {
            return (
              <div key="hub" className="flex aspect-square items-center justify-center rounded-xl bg-[#0B57D8] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_34px_-18px_rgba(0,0,0,0.7)]">
                <Mark className="h-[58%] w-[58%]" />
              </div>
            );
          }
          const it = v === null ? null : INTEGRATIONS[v];
          return (
            <div key={k} className="relative aspect-square rounded-xl bg-[#16295A] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              {!it && gone?.cell === k && (
                <div key={`gone-${k}-${gone.v}`} className="wb-pop-out absolute inset-0 flex items-center justify-center rounded-xl bg-white">
                  <Logo it={INTEGRATIONS[gone.v]} />
                </div>
              )}
              {it && (
                <div
                  key={`${k}-${v}`}
                  title={`${it.name}: ${it.note}`}
                  className={`absolute inset-0 flex items-center justify-center rounded-xl bg-white shadow-[0_2px_0_rgba(10,20,40,0.25),0_14px_28px_-16px_rgba(0,0,0,0.6)] ${fresh === k ? "wb-pop-in" : ""}`}
                >
                  <Logo it={it} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
