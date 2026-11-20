"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarCheck, CalendarClock, Check, Mail, Phone } from "lucide-react";

/**
 * Book a call, "what happens next" (David 2026-11-19: "besides the hero,
 * needs some pizzazz"). A coded copy of booking the setup call on
 * WorkBench's own booking page: a day is picked, a time is picked, Book it
 * is pressed, and the confirmation stamps in — confirmation email, a link to
 * reschedule, a reminder before the call (what the page promises, nothing
 * more). Loops while on screen; rests on the confirmation under reduced
 * motion. Times and days are illustrative.
 */

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const NAVY = "#1D2E52";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TIMES = ["9:00 AM", "10:30 AM", "1:00 PM", "2:30 PM", "4:00 PM"];
const DAY = 1;
const TIME = 1;
// beats: 1 day picked, 2 time picked, 3 Book it pressed, 4 confirmed
const BEATS = [900, 2000, 3100, 3600];
const LOOP_MS = 9000;

export default function WBBookSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(4);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let loop: ReturnType<typeof setInterval> | undefined;
    const run = () => {
      timers.forEach(clearTimeout);
      setBeat(0);
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
    return () => {
      io.disconnect();
      if (loop) clearInterval(loop);
      timers.forEach(clearTimeout);
    };
  }, []);

  const done = beat >= 4;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[460px] select-none text-left text-[#0A1428]" style={FONT} aria-hidden>
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_50px_-26px_rgba(10,20,40,0.45)]">
        <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: NAVY }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            <Phone className="h-4 w-4 text-[#FF8B33]" />
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold">Phone call</span>
            <span className="block text-[11px] text-white/65">WorkBench · times in your time zone</span>
          </span>
        </div>

        <div className={`p-5 transition-opacity duration-300 ${done ? "opacity-0" : "opacity-100"}`}>
          <p className="text-[11px] font-semibold text-gray-500">Pick a day</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {DAYS.map((d, i) => {
              const on = i === DAY && beat >= 1;
              return (
                <span
                  key={d}
                  className={`rounded-lg py-2 text-center text-[12px] font-semibold transition-colors duration-300 ${on ? "bg-[#0B57D8] text-white" : "bg-[#F3F5F9] text-gray-700"}`}
                >
                  {d}
                </span>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] font-semibold text-gray-500">Open times</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TIMES.map((t, i) => {
              const on = i === TIME && beat >= 2;
              return (
                <span
                  key={t}
                  className={`rounded-lg py-2 text-center text-[12px] font-semibold ring-1 transition-colors duration-300 ${on ? "bg-[#0B57D8] text-white ring-[#0B57D8]" : "bg-white text-[#0B57D8] ring-[#D6E2F8]"} ${beat < 1 ? "opacity-40" : ""}`}
                >
                  {t}
                </span>
              );
            })}
          </div>
          <span
            className={`mt-5 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-[transform,background-color] duration-200 ${beat >= 3 ? "scale-[0.98] bg-[#E25F06]" : "bg-[#F86A0A]"} ${beat < 2 ? "opacity-50" : ""}`}
          >
            Book it
          </span>
        </div>

        {done && (
          <div className="absolute inset-x-0 bottom-0 top-[68px] flex flex-col p-5">
            <div className="wb-pop-in flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#17703B] text-white">
                <Check className="h-6 w-6" strokeWidth={3} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold">You&apos;re booked</span>
                <span className="block text-[12px] text-gray-500">
                  Tuesday · {TIMES[TIME]}
                </span>
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {[
                { icon: Mail, t: "Confirmation sent to your email" },
                { icon: CalendarClock, t: "Reschedule from the link in it" },
                { icon: BellRing, t: "A reminder before we call" },
              ].map(({ icon: Icon, t }, k) => (
                <div key={t} className="wb-row-in flex items-center gap-3 rounded-lg bg-[#F3F5F9] px-3 py-2.5 text-[12.5px] text-gray-800" style={{ animationDelay: `${0.2 + k * 0.18}s` }}>
                  <Icon className="h-4 w-4 flex-none text-[#0B57D8]" />
                  {t}
                </div>
              ))}
            </div>
            <span className="wb-stamp-now absolute bottom-5 right-5 inline-flex rotate-[-6deg] items-center gap-1.5 rounded-md border-[3px] border-[#F86A0A] px-3 py-1 text-[14px] font-black uppercase tracking-[0.12em] text-[#F86A0A]">
              <CalendarCheck className="h-4 w-4" strokeWidth={2.6} /> Booked
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
