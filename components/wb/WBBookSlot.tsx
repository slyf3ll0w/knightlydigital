"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  Check,
  CheckCircle,
  Clock,
  Globe,
  Phone,
} from "lucide-react";

/**
 * Book a call, "what happens next": a copy of the REAL booking page for
 * WorkBench's own setup call (the embed further down the page,
 * /book/work-bench/phone-call → app/book/[slug]/schedule/[type]/
 * BookingStepper.tsx), in its own classes and WorkBench's booking accent
 * (2026-11-20 fidelity pass). The summary card and the "Pick a time" step:
 * a day is picked, a time is picked, the button turns into the chosen time
 * the way the real one does, and the page's own "You're booked!" screen
 * comes up (the "Your details" step in between is skipped for length).
 * Loops while on screen; rests on the confirmation under reduced motion.
 * Days and times are illustrative.
 */

const ACCENT = "#0362FC";
// Headings on the booking page are in the app display face (Lexend).
const HEAD = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const WASH = "color-mix(in srgb, #0362FC 13%, transparent)";
const DAYS = [
  "Mon, Nov 23",
  "Tue, Nov 24",
  "Wed, Nov 25",
  "Thu, Nov 26",
  "Fri, Nov 27",
];
const TIMES = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "1:00 PM",
];
const DAY = 1;
const TIME = 3;
// beats: 1 day picked, 2 time picked, 3 Next pressed, 4 booked
const BEATS = [1000, 2200, 3600, 4200];
const LOOP_MS = 9500;

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

  const day = beat >= 1 ? DAY : 0;
  const picked = beat >= 2;
  const done = beat >= 4;
  const when = `${DAYS[DAY]}, ${TIMES[TIME]}`;

  return (
    <div
      ref={ref}
      className="app-ui relative mx-auto min-h-[452px] w-full max-w-[460px] select-none text-left"
      aria-hidden
      inert
    >
      {done ? (
        <div
          className="card-ledger mx-auto max-w-lg px-6 py-10 text-center shadow-sm"
          style={{ animation: "toastIn 0.28s ease-out both" }}
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: WASH }}
          >
            <CheckCircle size={28} style={{ color: ACCENT }} />
          </div>
          <h2 className="mb-1 text-xl font-bold text-gray-900" style={HEAD}>
            You&apos;re booked!
          </h2>
          <p className="text-sm font-semibold text-gray-800">Phone call</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{when}</p>
          <p className="text-xs text-gray-500">America/Chicago</p>
          <p className="mt-3 text-sm text-gray-500">
            A confirmation with calendar invite is on its way to your inbox.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: ACCENT }}
            >
              <CalendarPlus size={14} /> Google Calendar
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: ACCENT }}
            >
              <CalendarPlus size={14} /> Apple / Outlook
            </span>
          </div>
          <p className="mt-5 text-xs text-gray-500">
            Need to change it?{" "}
            <span className="underline">Reschedule or cancel</span>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <aside className="card-ledger p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: WASH, color: ACCENT }}
              >
                <Phone size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  Phone call
                </p>
                <p className="text-xs text-gray-500">WorkBench</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-500" />
                <span>30 min</span>
              </div>
              {picked && (
                <div className="flex items-start gap-2">
                  <CalendarPlus size={14} className="mt-0.5 text-gray-500" />
                  <span className="font-medium">{when}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-gray-500" />
                <span className="text-xs text-gray-700">America/Chicago</span>
              </div>
            </dl>
            <p className="mt-4 text-xs text-gray-500">Confirmed instantly.</p>
          </aside>
          <div className="card-ledger relative space-y-4 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900" style={HEAD}>
                Pick a time
              </h2>
              <div className="flex items-center gap-1">
                <span
                  className="h-1.5 w-5 rounded-full"
                  style={{ backgroundColor: ACCENT }}
                />
                <span
                  className="h-1.5 w-5 rounded-full"
                  style={{ backgroundColor: "#e5e7eb" }}
                />
              </div>
            </div>
            <div>
              <div className="-mx-1 flex gap-1.5 overflow-hidden px-1 pb-2">
                {DAYS.map((d, k) => {
                  const active = k === day;
                  return (
                    <span
                      key={d}
                      className={`shrink-0 rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "" : "border-gray-300 text-gray-600"}`}
                      style={
                        active
                          ? {
                              backgroundColor: ACCENT,
                              borderColor: ACCENT,
                              color: "#ffffff",
                            }
                          : undefined
                      }
                    >
                      {d}
                    </span>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {TIMES.map((t, k) => {
                  const selected = picked && k === TIME;
                  return (
                    <span
                      key={t}
                      className={`rounded border px-2 py-2 text-center text-xs font-medium transition-colors ${selected ? "" : "border-gray-300 text-gray-700"}`}
                      style={
                        selected
                          ? {
                              backgroundColor: ACCENT,
                              borderColor: ACCENT,
                              color: "#ffffff",
                            }
                          : undefined
                      }
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Times in America/Chicago.
              </p>
            </div>
            <span
              className={`flex w-full items-center justify-center gap-2 rounded py-3 text-sm font-semibold transition-opacity ${picked ? "" : "opacity-50"}`}
              style={{
                backgroundColor: ACCENT,
                color: "#ffffff",
                opacity: beat === 3 ? 0.8 : undefined,
              }}
            >
              {picked ? (
                <>
                  <Check size={14} /> {when}
                </>
              ) : (
                "Next"
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
