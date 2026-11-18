"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * "What WorkBench does", round 5 (David 2026-11-18: the bento was "a bit too
 * busy and confusing"; simpler but still good-looking). Four jobs on the
 * left; one real screen on the right that changes with them. It advances by
 * itself (a progress line fills under the active one) until someone clicks,
 * then it stays where they put it. Only while on screen; still under
 * reduced motion.
 */

const ITEMS = [
  {
    title: "Win the work",
    body: "Requests come in booked. Quotes go out with options and get signed from a phone.",
    href: "/features/quotes-and-invoicing",
    shot: { src: "/screens/desktop-quotes.jpg", alt: "A quote in WorkBench with line items, ready to send for signature" },
  },
  {
    title: "Run the day",
    body: "Drag jobs onto the calendar. The crew sees it on their phones the same second.",
    href: "/features/scheduling-dispatch",
    shot: { src: "/screens/desktop-schedule.jpg", alt: "The WorkBench schedule: a week of jobs per crew member" },
  },
  {
    title: "Track every job",
    body: "Notes, photos, time and status on every job, from the first visit to the invoice.",
    href: "/features",
    shot: { src: "/screens/desktop-jobs.jpg", alt: "The WorkBench jobs list with status on every job" },
  },
  {
    title: "Get paid",
    body: "One-click invoices, card and bank payments, and reminders that send themselves.",
    href: "/features/payments",
    shot: { src: "/screens/desktop-invoices.jpg", alt: "WorkBench invoices, each with its payment status" },
  },
];

const EACH_MS = 6000;

export default function WBFeatureTabs() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAuto(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      if (visible.current) setI((n) => (n + 1) % ITEMS.length);
      setTick((n) => n + 1);
    }, EACH_MS);
    return () => clearTimeout(t);
  }, [auto, i, tick]);

  const pick = (n: number) => {
    setAuto(false);
    setI(n);
  };

  return (
    <div ref={ref} className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:gap-14">
      <ul className="space-y-2" role="tablist" aria-label="What WorkBench does">
        {ITEMS.map((it, n) => {
          const on = n === i;
          return (
            <li key={it.title}>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(n)}
                className={`relative w-full overflow-hidden rounded-xl px-5 py-4 text-left transition-colors ${on ? "bg-white shadow-[0_14px_34px_-18px_rgba(10,20,40,0.3)] ring-1 ring-gray-200" : "hover:bg-white/60"}`}
              >
                <span className={`block text-[20px] font-extrabold ${on ? "text-gray-900" : "text-gray-400"}`}>{it.title}</span>
                <span className={`grid transition-all duration-300 ${on ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <span className="overflow-hidden">
                    <span className="block text-[15px] leading-relaxed text-gray-600">{it.body}</span>
                  </span>
                </span>
                {on && auto && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gray-100">
                    <span key={`${i}-${tick}`} className="wb-progress block h-full bg-[#F86A0A]" style={{ animationDuration: `${EACH_MS}ms` }} />
                  </span>
                )}
              </button>
              {on && (
                <Link href={it.href} className="ml-5 mt-2 inline-flex items-center gap-1 text-[14px] font-bold text-[#0B57D8] hover:underline">
                  Learn more about {it.title.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="relative rounded-2xl bg-gradient-to-br from-[#0B57D8] to-[#0A1428] p-3 sm:p-5">
        <div className="relative aspect-[1512/791] overflow-hidden rounded-lg bg-white shadow-[0_30px_60px_-24px_rgba(0,0,0,0.6)]">
          {ITEMS.map((it, n) => (
            <Image
              key={it.title}
              src={it.shot.src}
              alt={n === i ? it.shot.alt : ""}
              fill
              sizes="(min-width: 1024px) 680px, 100vw"
              className={`object-cover object-left-top transition-opacity duration-500 ${n === i ? "opacity-100" : "opacity-0"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
