"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Phone, Play } from "lucide-react";
import { WB_VIDEOS } from "@/lib/wb-videos";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * "WorkBench in action" on the home page: a list of short silent videos
 * (lib/wb-videos.ts) beside one player. Picking a video swaps the player and
 * starts it (muted, so browsers allow it); nothing autoplays before a click.
 * Phones get the 9:16 cut (its captions are sized for a phone) and, since the
 * buttons sit under the player there, a pick scrolls the player into view.
 * Adding a video is one entry in WB_VIDEOS — the list grows by itself.
 */
export default function WBInAction() {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [phone, setPhone] = useState(false);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const v = WB_VIDEOS[index];

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const pick = (i: number) => {
    setIndex(i);
    setStarted(true);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % WB_VIDEOS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + WB_VIDEOS.length) % WB_VIDEOS.length;
    else return;
    e.preventDefault();
    pick(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8">
        <div role="tablist" aria-label="WorkBench in action" aria-orientation="vertical" className="order-2 grid gap-3 lg:order-1">
          {WB_VIDEOS.map((x, i) => {
            const active = i === index;
            return (
              <button
                key={x.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`${id}-tab-${x.key}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                type="button"
                onClick={() => pick(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`flex w-full items-start gap-3.5 rounded-2xl px-4 py-4 text-left transition-colors ${
                  active ? "bg-[#0A1428] text-white" : "bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-gray-300"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full ${active ? "bg-[#0B57D8] text-white" : "bg-blue-50 text-[#0B57D8]"}`}
                  aria-hidden
                >
                  <Play className="ml-0.5 h-4 w-4" strokeWidth={2.5} fill="currentColor" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-bold leading-snug">{x.title}</span>
                  <span className={`mt-1 block text-[13.5px] leading-snug ${active ? "text-white/70" : "text-gray-500"}`}>{x.blurb}</span>
                  <span className={`mt-1.5 block text-[12px] font-semibold ${active ? "text-white/60" : "text-gray-400"}`}>{x.seconds} sec · no sound</span>
                </span>
              </button>
            );
          })}
        </div>

        <div ref={playerRef} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${v.key}`} className="order-1 lg:order-2">
          <div className={`wb-frame-hero overflow-hidden rounded-2xl bg-[#0A1428] ${phone ? "mx-auto max-w-[360px]" : ""}`}>
            <video
              key={`${v.key}-${phone ? "v" : "h"}`}
              className={`block w-full ${phone ? "aspect-[9/16]" : "aspect-video"}`}
              src={phone ? v.srcVertical : v.src}
              poster={phone ? v.posterVertical : v.poster}
              controls
              muted
              playsInline
              autoPlay={started}
              preload="metadata"
              aria-label={`${v.title}: ${v.blurb}`}
            />
          </div>
          {v.guide && (
            <Link href={v.guide} className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
              Read the step-by-step guide
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start gap-6 rounded-[1.75rem] bg-[#0A1428] px-6 py-8 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[21px] font-extrabold leading-snug sm:text-[24px]">That&apos;s just a few of the things WorkBench can do.</p>
          <p className="mt-2 text-[15px] leading-relaxed text-white/70">
            Online booking, invoices and payments, recurring plans, a client portal, time tracking, team chat and a lot more. Tell us how your business runs and we&apos;ll show you how it fits.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:shrink-0 lg:flex-nowrap">
          <Link href="/contact" className="wb-pill wb-pill-light">
            Contact us to learn more
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <a href={WB_PHONE.href} className="wb-pill wb-pill-ghost">
            <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {WB_PHONE.display}
          </a>
        </div>
      </div>
    </div>
  );
}
