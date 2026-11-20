"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, MapPin, Play, Square } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { Card, Chip, FONT, NAVY, PageHead, Phone, prefersReduced, usd, useDemoLoop, useRoll } from "./kit";

/**
 * Time tracking (Pro): the tech clocks in on the job from their phone and
 * the timer runs; on the desktop, the week's Timesheets fill in day by day
 * for the crew and "Labor on this job" rolls up from each person's hours ×
 * their cost rate. Phones show only the timesheet. Rests on the full week
 * under reduced motion.
 */

export type CrewMember = { name: string; role: string; rate: number; hours: number[] };

const DEFAULTS = {
  job: "Job #318 · Panel upgrade",
  crew: [
    { name: "Sam Rivera", role: "Lead tech", rate: 32, hours: [8, 7.5, 8, 6, 4] },
    { name: "Jess Moreno", role: "Tech", rate: 26, hours: [8, 8, 7, 6, 0] },
    { name: "Mike Delgado", role: "Owner", rate: 40, hours: [2, 0, 1.5, 0, 2] },
  ] as CrewMember[],
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const fmtH = (h: number) => (h === 0 ? "–" : Number.isInteger(h) ? `${h}:00` : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);

export default function WBDemoTimesheet({ job = DEFAULTS.job, crew = DEFAULTS.crew, week = "Oct 26 – Oct 30" }: { job?: string; crew?: CrewMember[]; week?: string } = {}) {
  const people = crew.slice(0, 4);
  const dayTimes = DAYS.map((_, d) => 1500 + d * 850);
  const last = 1500 + 4 * 850;
  // 1 clock in · 2..6 a day fills · 7 clock out
  const { ref, b } = useDemoLoop([600, ...dayTimes, last + 900], last + 4600);
  const days = Math.max(0, Math.min(5, b - 1));
  const running = b >= 1 && b < 7;
  const out = b >= 7;

  const hoursOf = (p: CrewMember) => p.hours.slice(0, days).reduce((a, h) => a + (h || 0), 0);
  const labor = people.reduce((a, p) => a + hoursOf(p) * p.rate, 0);
  const shownLabor = useRoll(labor, 600);
  const totalHours = people.reduce((a, p) => a + hoursOf(p), 0);

  // the phone's timer fast-forwards through the morning
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (prefersReduced()) {
      setSecs(4 * 3600 + 12 * 60);
      return;
    }
    if (b === 0) {
      setSecs(0);
      return;
    }
    if (!running) return;
    const t = setInterval(() => setSecs((s) => Math.min(4 * 3600 + 12 * 60, s + 150)), 50);
    return () => clearInterval(t);
  }, [b, running]);
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const me = people[0];

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden>
      <Phone width={270} height={500} screen="bg-[#F4F5F8]" className="max-sm:hidden">
        <div className="flex h-full flex-col text-left" style={FONT}>
          <div className="flex items-center gap-1 px-3 pb-1 text-[12px] font-semibold text-[#0B57D8]">
            <ChevronLeft className="h-4 w-4" /> Today
          </div>
          <div className="px-4 pb-3">
            <p className="text-[10.5px] text-gray-500">{me?.name ?? "Sam Rivera"} · on the job</p>
            <p className="text-[17px] font-semibold leading-tight text-gray-900">{job}</p>
          </div>
          <div className="mx-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(10,20,40,0.06)]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-gray-900">Time clock</span>
              {running ? (
                <Chip tone="green">
                  <span className="wb-demo-live h-1.5 w-1.5 rounded-full bg-[#17A34A]" /> On the clock
                </Chip>
              ) : out ? (
                <Chip tone="gray">Clocked out</Chip>
              ) : (
                <Chip tone="gray">Off the clock</Chip>
              )}
            </div>
            <p className="mt-3 text-center text-[40px] font-semibold leading-none tabular-nums text-gray-900">
              {hh}:{mm}
              <span className="text-[20px] text-gray-400">:{ss}</span>
            </p>
            <span
              className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[12.5px] font-semibold text-white transition-[transform,background-color] duration-300 ${b === 1 || b === 7 ? "scale-[0.97]" : ""}`}
              style={{ background: running ? "#B91C1C" : NAVY }}
            >
              {running ? (
                <>
                  <Square className="h-3 w-3 fill-white" /> Clock out
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-white" /> Clock in
                </>
              )}
            </span>
            <p className={`mt-2.5 flex items-center justify-center gap-1 text-[10px] transition-opacity duration-500 ${b >= 1 ? "text-gray-500 opacity-100" : "opacity-0"}`}>
              <MapPin className="h-3 w-3" /> Location saved at clock-in · 7:58a
            </p>
          </div>
          <div className="mx-3 mt-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(10,20,40,0.06)]">
            <p className="text-[11.5px] font-semibold text-gray-900">This week</p>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {DAYS.map((d, k) => {
                const h = me?.hours[k] ?? 0;
                const filled = k < days;
                return (
                  <span key={d} className="flex flex-col items-center gap-1">
                    <span className="flex h-[54px] w-full items-end overflow-hidden rounded-md bg-[#F0F2F5]">
                      <span className="w-full rounded-md bg-[#0B57D8] transition-[height] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ height: filled ? `${(h / 9) * 100}%` : "0%" }} />
                    </span>
                    <span className="text-[9px] text-gray-500">{d}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </Phone>

      <div className="min-w-0 flex-1">
        <WBAppFrame nav="Timesheets" height={456} heightSm={372} sidebarFrom="xl">
          <PageHead sub={week} title="Timesheets" right={<Chip tone="blue">{job}</Chip>} />
          <Card className="mt-3">
            <div className="grid items-center gap-x-1 border-b border-[#EEF0F3] px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400 sm:px-4 [grid-template-columns:minmax(0,1fr)_repeat(5,30px)_44px] sm:[grid-template-columns:minmax(0,1fr)_repeat(5,40px)_48px_70px]">
              <span>Person</span>
              {DAYS.map((d) => (
                <span key={d} className="text-center">
                  {d}
                </span>
              ))}
              <span className="text-right">Total</span>
              <span className="text-right max-sm:hidden">Cost</span>
            </div>
            {people.map((p) => (
              <Row key={p.name} p={p} days={days} />
            ))}
            <div className="grid items-center gap-x-1 bg-[#F8F9FB] px-3 py-2.5 text-[11px] sm:px-4 [grid-template-columns:minmax(0,1fr)_44px] sm:[grid-template-columns:minmax(0,1fr)_48px_70px]">
              <span className="font-semibold text-gray-900">Week</span>
              <span className="text-right font-semibold tabular-nums text-gray-900">{fmtH(Math.round(totalHours * 4) / 4)}</span>
              <span className="text-right font-semibold tabular-nums text-gray-900 max-sm:hidden">{usd(Math.round(labor))}</span>
            </div>
          </Card>
          <Card className="mt-3 flex items-center justify-between px-4 py-3">
            <span>
              <span className="block text-[11.5px] font-semibold text-gray-900">Labor on this job</span>
              <span className="block text-[10px] text-gray-500">Hours × each person&apos;s cost rate</span>
            </span>
            <span className="text-[22px] font-semibold tabular-nums text-gray-900">{usd(shownLabor)}</span>
          </Card>
        </WBAppFrame>
      </div>
    </div>
  );
}

function Row({ p, days }: { p: CrewMember; days: number }) {
  const hours = p.hours.slice(0, days).reduce((a, h) => a + (h || 0), 0);
  const shown = useRoll(hours, 500);
  return (
    <div className="grid items-center gap-x-1 border-b border-[#EEF0F3] px-3 py-2 sm:px-4 [grid-template-columns:minmax(0,1fr)_repeat(5,30px)_44px] sm:[grid-template-columns:minmax(0,1fr)_repeat(5,40px)_48px_70px]">
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-semibold text-gray-900">{p.name}</span>
        <span className="block truncate text-[9.5px] text-gray-500">
          {p.role} · {usd(p.rate)}/hr
        </span>
      </span>
      {DAYS.map((d, k) => (
        <span key={d} className="flex justify-center">
          {k < days ? (
            <span key="h" className={`wb-pop-in rounded-md px-1 py-1 text-[10px] font-semibold tabular-nums ${p.hours[k] ? "bg-[#E8EEFB] text-[#22406E]" : "text-gray-300"}`}>
              {fmtH(p.hours[k] ?? 0)}
            </span>
          ) : (
            <span className="h-[22px] w-full rounded-md bg-[#F4F5F8]" />
          )}
        </span>
      ))}
      <span className="text-right text-[11px] font-semibold tabular-nums text-gray-900">{fmtH(Math.round(shown * 4) / 4)}</span>
      <span className="text-right text-[11px] tabular-nums text-gray-700 max-sm:hidden">{usd(Math.round(shown * p.rate))}</span>
    </div>
  );
}
