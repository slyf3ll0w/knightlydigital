"use client";

import { useEffect, useRef, useState } from "react";
import type { Announcement } from "@/lib/wb-announcements";

/**
 * The picture that goes with an announcement: a coded copy of the screen
 * the post is about, its numbers growing in when it scrolls into view
 * (drawn finished under reduced motion). Add a case per post slug; a post
 * without one gets its "How to find it" steps drawn as an app card, so a
 * new post never needs layout work.
 */

/* Lead sources report (Insights → Lead sources), Brightwire Electric demo numbers. */
const SOURCES: { name: string; leads: number; quoted: number; won: number; collected: number }[] = [
  { name: "Referral", leads: 14, quoted: 12, won: 9, collected: 18640 },
  { name: "Google search", leads: 22, quoted: 15, won: 8, collected: 14210 },
  { name: "Google Ads", leads: 31, quoted: 14, won: 5, collected: 7920 },
  { name: "Yard sign", leads: 6, quoted: 4, won: 3, collected: 4380 },
  { name: "Facebook", leads: 11, quoted: 3, won: 1, collected: 960 },
];
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(() => setOn(true));
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return { ref, on };
}

const APP_FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const FRAME =
  "overflow-hidden rounded-xl bg-white text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_24px_44px_-24px_rgba(10,20,40,0.45)]";

function LeadSourcesReport() {
  const { ref, on } = useInView<HTMLDivElement>();
  const max = Math.max(...SOURCES.map((s) => s.collected));
  return (
    <div ref={ref} className={FRAME} style={APP_FONT} aria-hidden>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-gray-400">Insights</p>
          <p className="truncate text-[16px] font-semibold">Lead sources</p>
        </div>
        <div className="flex flex-none rounded-lg bg-[#F1F4F9] p-0.5 text-[11.5px] font-medium">
          <span className="rounded-md px-2 py-1 text-gray-500">30 days</span>
          <span className="rounded-md bg-white px-2 py-1 shadow-[0_1px_2px_rgba(10,20,40,0.12)]">90 days</span>
          <span className="hidden rounded-md px-2 py-1 text-gray-500 sm:inline">12 months</span>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.55fr)_minmax(0,0.8fr)_minmax(0,1.1fr)] gap-x-3 px-5 pb-2 pt-3 text-[10.5px] font-medium text-gray-400 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.55fr))_minmax(0,1.5fr)]">
        <span>Source</span>
        <span className="text-right">Leads</span>
        <span className="hidden text-right sm:block">Quoted</span>
        <span className="whitespace-nowrap text-right">Win rate</span>
        <span className="text-right">Collected</span>
      </div>
      <ul>
        {SOURCES.map((s, i) => {
          const rate = Math.round((s.won / s.leads) * 100);
          return (
            <li
              key={s.name}
              className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.55fr)_minmax(0,0.8fr)_minmax(0,1.1fr)] items-center gap-x-3 border-t border-gray-100 px-5 py-3 text-[13px] sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.55fr))_minmax(0,1.5fr)]"
              style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(6px)", transition: `opacity .5s ${i * 0.09}s, transform .5s ${i * 0.09}s` }}
            >
              <span className="truncate font-medium">{s.name}</span>
              <span className="text-right tabular-nums text-gray-600">{s.leads}</span>
              <span className="hidden text-right tabular-nums text-gray-600 sm:block">{s.quoted}</span>
              <span className={`text-right font-semibold tabular-nums ${rate >= 50 ? "text-[#17A34A]" : rate < 20 ? "text-[#C2410C]" : "text-gray-700"}`}>
                {rate}%
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2F8] sm:block">
                  <span
                    className="block h-full rounded-full bg-[#0B57D8]"
                    style={{ width: on ? `${(s.collected / max) * 100}%` : "0%", transition: `width .9s cubic-bezier(.2,.8,.2,1) ${0.2 + i * 0.09}s` }}
                  />
                </span>
                <span className="w-[4.2rem] text-right font-semibold tabular-nums">{usd(s.collected)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-gray-100 bg-[#F8FAFC] px-5 py-3 text-[12px] text-gray-500">
        <span>Tap a source to see its leads</span>
        <span className="font-semibold text-[#0B57D8]">84 leads</span>
      </div>
    </div>
  );
}

/** Fallback: the post's "How to find it" steps as an app card. */
function StepsCard({ a }: { a: Announcement }) {
  const { ref, on } = useInView<HTMLDivElement>();
  const steps = a.blocks.find((b) => b.type === "steps");
  const items = steps && steps.type === "steps" ? steps.items.slice(0, 4) : [a.summary];
  return (
    <div ref={ref} className={FRAME} style={APP_FONT} aria-hidden>
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[11.5px] font-medium text-gray-400">How to find it</p>
        <p className="text-[16px] font-semibold">{a.title}</p>
      </div>
      <ol>
        {items.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 border-t border-gray-100 px-5 py-3.5 text-[13.5px] leading-snug first:border-t-0"
            style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${i * 0.12}s` }}
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#0A1428] text-[12px] font-semibold text-white">{i + 1}</span>
            <span className="pt-0.5 text-gray-700">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function WBAnnounceVisual({ announcement }: { announcement: Announcement }) {
  if (announcement.slug === "lead-sources") return <LeadSourcesReport />;
  return <StepsCard a={announcement} />;
}
