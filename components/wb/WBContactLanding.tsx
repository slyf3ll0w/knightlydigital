"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox, MessageSquare, Send, UserRound } from "lucide-react";

/**
 * Contact page, "what happens next" (David 2026-11-19: "besides the hero,
 * needs some pizzazz"). A coded copy of the moment a message from the site's
 * Contact us form lands: the message is written and sent, a paper plane
 * leaves, and it slides into the top of WorkBench's own Leads list (the same
 * leads board customers use), where a person on the team picks it up.
 * Loops while on screen; rests on the final frame under reduced motion.
 * Demo names only.
 */

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const NAVY = "#1D2E52";
const MESSAGE = "Hi! We run a four-person HVAC crew and want to see how quoting works on the phone.";
// beats: 1 typing done, 2 sent (plane), 3 lands in leads, 4 picked up
const BEATS = [2600, 3300, 4100, 6200];
const LOOP_MS = 9200;

const OTHERS = [
  { who: "Derek Olsen", what: "Question about online booking", when: "Yesterday" },
  { who: "Olivia Park", what: "Moving over from spreadsheets", when: "Mon" },
];

export default function WBContactLanding() {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(4);
  const [typed, setTyped] = useState(MESSAGE.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let loop: ReturnType<typeof setInterval> | undefined;
    let typer: ReturnType<typeof setInterval> | undefined;
    const run = () => {
      timers.forEach(clearTimeout);
      if (typer) clearInterval(typer);
      setBeat(0);
      setTyped(0);
      let n = 0;
      typer = setInterval(() => {
        n += 2;
        setTyped(Math.min(n, MESSAGE.length));
        if (n >= MESSAGE.length && typer) clearInterval(typer);
      }, 45);
      timers = BEATS.map((ms, k) => setTimeout(() => setBeat(k + 1), ms));
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!loop) {
            run();
            loop = setInterval(run, LOOP_MS);
          }
        } else if (loop) {
          clearInterval(loop);
          loop = undefined;
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    setBeat(0);
    setTyped(0);
    return () => {
      io.disconnect();
      if (loop) clearInterval(loop);
      if (typer) clearInterval(typer);
      timers.forEach(clearTimeout);
    };
  }, []);

  const sent = beat >= 2;
  return (
    <div ref={ref} className="relative select-none text-left text-[#0A1428]" style={FONT} aria-hidden>
      {/* The visitor's side: the Contact us form */}
      <div
        className={`relative z-10 w-[88%] max-w-[360px] rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)] transition-[opacity,transform] duration-500 ${sent ? "-translate-y-2 opacity-40" : "opacity-100"}`}
      >
        <p className="text-[12px] font-semibold text-gray-500">Contact us · WorkBench</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
          <span className="rounded-lg bg-[#F3F5F9] px-2.5 py-2 text-gray-800">Hannah Brooks</span>
          <span className="rounded-lg bg-[#F3F5F9] px-2.5 py-2 text-gray-800">Brooks Air</span>
        </div>
        <p className="mt-2 min-h-[58px] rounded-lg bg-[#F3F5F9] px-2.5 py-2 text-[11.5px] leading-snug text-gray-800">
          {MESSAGE.slice(0, typed)}
          {typed < MESSAGE.length && <span className="ml-px inline-block h-3 w-px translate-y-0.5 animate-pulse bg-gray-800" />}
        </p>
        <div className="relative mt-3 flex justify-end">
          <span className={`inline-flex items-center gap-1.5 rounded-lg bg-[#F86A0A] px-3 py-1.5 text-[11.5px] font-semibold text-white transition-transform ${beat === 1 ? "scale-105" : ""}`}>
            Send <Send className="h-3 w-3" />
          </span>
          {beat === 2 && <Send className="wb-plane pointer-events-none absolute right-3 top-1 h-4 w-4 text-[#0B57D8]" />}
        </div>
      </div>

      {/* Our side: WorkBench's own Leads */}
      <div className="relative mt-4 ml-auto w-[94%] overflow-hidden rounded-xl bg-[#F7F8FA] shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_50px_-26px_rgba(10,20,40,0.45)]">
        <div className="flex items-center gap-2 px-4 py-2.5 text-white" style={{ background: NAVY }}>
          <Inbox className="h-3.5 w-3.5 text-[#FF8B33]" />
          <span className="text-[12px] font-semibold">WorkBench · Leads</span>
          <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">New {beat >= 3 ? 3 : 2}</span>
        </div>
        <div className="space-y-2 p-3">
          {beat >= 3 && (
            <div className="wb-row-in flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[0_0_0_1px_#F86A0A55]">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F86A0A] text-[10px] font-semibold text-white">HB</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-gray-900">Hannah Brooks · Brooks Air</span>
                <span className="block truncate text-[10.5px] text-[#C2410C]">Contact us form · just now</span>
              </span>
              {beat >= 4 ? (
                <span className="wb-pop-in inline-flex flex-none items-center gap-1 rounded-full bg-[#E3F5EA] px-2 py-0.5 text-[10px] font-semibold text-[#17703B]">
                  <UserRound className="h-3 w-3" /> Picked up
                </span>
              ) : (
                <span className="flex-none rounded-full bg-[#FDF3DC] px-2 py-0.5 text-[10px] font-semibold text-[#8A5A07]">New</span>
              )}
            </div>
          )}
          {OTHERS.map((o) => (
            <div key={o.who} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-[#E3E6EC]">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#3E5277] text-[10px] font-semibold text-white">
                {o.who.split(" ").map((w) => w[0]).join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-gray-900">{o.who}</span>
                <span className="block truncate text-[10.5px] text-gray-500">
                  {o.what} · {o.when}
                </span>
              </span>
              <span className="flex-none rounded-full bg-[#E8EEFB] px-2 py-0.5 text-[10px] font-semibold text-[#22406E]">Replied</span>
            </div>
          ))}
        </div>
        {beat === 3 && (
          <div className="wb-toast-in absolute right-3 top-12 flex items-center gap-2 rounded-lg bg-[#0A1428] px-3 py-2 text-[11px] text-white shadow-lg sm:top-11">
            <MessageSquare className="h-3.5 w-3.5 text-[#FF8B33]" />
            New lead from the website
          </div>
        )}
      </div>
    </div>
  );
}
