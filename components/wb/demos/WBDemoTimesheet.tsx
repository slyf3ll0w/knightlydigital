"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle, ChevronLeft, ChevronRight, Download, MapPin, MoreHorizontal, PenLine, Pencil, Play, Plus, Square, Timer } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { FONT, prefersReduced, useDemoLoop, useRoll } from "./kit";
import { BW, DsCard, DsChip, FoldRow, PhoneApp } from "./WBDemoChecklist";

/**
 * Time tracking: the tech's phone job page with the real Time clock card
 * (app/platform/jobs/[id]/ClockCard.tsx: Clock in, the running time, Clock
 * out), the week on /app/timesheets (one card per person, a row per entry,
 * the running entry in green with its live dot), and then the job page's
 * Profit margin card, where logged hours × each person's cost become the
 * Labor line. Phones show only the tech's phone. Rests on the job's margin
 * card under reduced motion.
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
const DAYS = ["Mon, Oct 26", "Tue, Oct 27", "Wed, Oct 28", "Thu, Oct 29", "Fri, Oct 30"];
const TODAY = 4;
const START = 8 * 60; // everyone starts at 8:00 AM

/** lib/time-entries.ts formatDuration, in minutes. */
const dur = (min: number) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};
const clock = (min: number) => {
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(Math.round(min % 60)).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function WBDemoTimesheet({
  job = DEFAULTS.job,
  crew = DEFAULTS.crew,
  weekOf = "October 25",
  revenue = 4200,
  materials = 1380,
}: {
  job?: string;
  crew?: CrewMember[];
  /** Kept for callers ("Oct 26 – Oct 30"); the real page names the week by its Sunday (weekOf). */
  week?: string;
  weekOf?: string;
  /** The job's line-item total and cost, for the Profit margin card. */
  revenue?: number;
  materials?: number;
} = {}) {
  const parts = job.split(" · ");
  const jobTitle = /^Job #/.test(parts[0]) ? (parts[1] ?? "Panel upgrade") : parts[0];
  const jobClient = /^Job #/.test(parts[0]) ? "Grace Kim" : (parts[1] ?? "Grace Kim");
  const people = crew.slice(0, 4);
  const me = people.find((p) => !/owner/i.test(p.role)) ?? people[0];
  const myToday = Math.round(((me?.hours[TODAY] || 4) * 60) / 15) * 15;

  // 1 clock in · 2 the others' rows · 3 clock out · 4 open the job · 5 labor lands
  const { ref, b } = useDemoLoop([900, 1900, 5600, 6900, 7600], 11800);
  const clockedIn = b >= 1 && b < 3;
  const clockedOut = b >= 3;
  const onJobPage = b >= 4;

  // the phone's running time, fast-forwarded through the morning
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (prefersReduced()) {
      setElapsed(myToday);
      return;
    }
    if (b === 0) {
      setElapsed(0);
      return;
    }
    if (!clockedIn) {
      setElapsed(myToday);
      return;
    }
    const t = setInterval(() => setElapsed((s) => Math.min(myToday - 1, s + 3)), 40);
    return () => clearInterval(t);
  }, [b, clockedIn, myToday]);

  // entries: Mon–Thu are in; today's arrive as people clock in
  type Entry = { day: number; start: number; min: number; open: boolean };
  const entriesOf = (p: CrewMember): Entry[] => {
    const out: Entry[] = [];
    p.hours.slice(0, 5).forEach((h, d) => {
      if (!h) return;
      const min = Math.round((h * 60) / 15) * 15;
      if (d < TODAY) out.push({ day: d, start: START, min, open: false });
      else if (p === me) {
        if (b >= 1) out.push({ day: d, start: START, min: clockedOut ? myToday : elapsed, open: !clockedOut });
      } else if (b >= 2) out.push({ day: d, start: START, min: Math.min(min, clockedOut ? min : (elapsed / myToday) * min), open: !clockedOut });
    });
    return out;
  };
  const groups = people.map((p) => ({ p, entries: entriesOf(p) })).sort((x, y) => x.p.name.localeCompare(y.p.name));
  const grand = groups.reduce((a, g) => a + g.entries.reduce((s, e) => s + e.min, 0), 0);
  const loggedMin = (p: CrewMember) => entriesOf(p).reduce((s, e) => s + e.min, 0);
  const laborMin = people.reduce((a, p) => a + loggedMin(p), 0);
  const labor = people.reduce((a, p) => a + (loggedMin(p) / 60) * p.rate, 0);
  const shownLabor = useRoll(onJobPage ? labor : 0, 900);
  const profit = revenue - materials - shownLabor;

  // keep the tech's card in view on the timesheet; the margin card on the job page
  const sheetRef = useRef<HTMLDivElement>(null);
  const myCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sheetRef.current;
    const card = myCardRef.current;
    if (!el || !card || onJobPage) return;
    el.scrollTo({ top: b >= 1 ? Math.max(0, card.offsetTop - 12) : 0, behavior: "smooth" });
  }, [b, onJobPage]);

  const phoneScroll = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = phoneScroll.current;
    const card = clockRef.current;
    if (el && card) el.scrollTo({ top: Math.max(0, card.offsetTop - 260) });
  }, []);
  const notes = (b >= 1 ? 1 : 0) + (clockedOut ? 1 : 0);
  const jobLogged = groups.reduce((a, g) => a + g.entries.filter((e) => !e.open).reduce((s, e) => s + e.min, 0), 0);

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden data-wb-demo="timesheet">
      {/* the tech's phone: the job page, down at the Time clock */}
      <div className="relative flex-none">
        <PhoneApp back="Jobs" scrollRef={phoneScroll} width={280} height={540}>
          <div className="mb-4 flex items-center gap-3">
            <DsChip tone="good">Active</DsChip>
          </div>
          <div className="mb-6">
            <p className="text-[28px] font-[650] leading-[1.12] tracking-[-0.022em]">{jobTitle}</p>
            <p className="text-sm font-semibold" style={{ color: BW.primary }}>
              {jobClient}
            </p>
          </div>
          <DsCard className="mb-6 flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
            <div>
              <span className="block text-xs font-medium text-gray-500">Job #</span>
              <span className="text-gray-800">318</span>
            </div>
            <div className="basis-full">
              <span className="block text-xs font-medium text-gray-500">Scheduled</span>
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: BW.primary }}>
                <CalendarDays size={14} /> Oct 30, 8:00 AM
              </span>
            </div>
          </DsCard>
          <div className="space-y-4">
            <DsCard className="p-5">
              <p className="mb-4 text-[14.5px] font-semibold">Details</p>
              <div className="flex items-start gap-3">
                <MapPin size={15} className="mt-0.5 flex-none text-gray-400" />
                <p className="text-sm text-gray-800">412 Oak Ln, Plano, TX 75074</p>
              </div>
            </DsCard>
            <FoldRow title="Notes & Activity" meta={notes ? String(notes) : "Add"} />
            <FoldRow title="Photos" meta="Add" />
            <div ref={clockRef}>
              <DsCard className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[14.5px] font-semibold">Time clock</p>
                  {jobLogged > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Timer size={12} />
                      {dur(jobLogged)} logged
                    </span>
                  )}
                </div>
                {clockedIn ? (
                  <>
                    <p className="mb-3 text-2xl font-semibold tabular-nums text-gray-900">{dur(elapsed)}</p>
                    <span className={`relative flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15.5px] font-semibold text-white transition-transform ${b === 2 && elapsed > myToday - 30 ? "scale-[0.97]" : ""}`} style={{ background: BW.ink }}>
                      <Square size={14} fill="currentColor" />
                      Clock out
                    </span>
                  </>
                ) : (
                  <span className={`relative flex h-12 w-full items-center justify-center gap-2 rounded-[12px] text-base font-semibold text-white transition-transform ${b === 0 ? "" : "scale-100"}`} style={{ background: BW.primary }}>
                    <Play size={14} fill="currentColor" />
                    Clock in
                    {b === 0 && <span key="tap" className="wb-demo-tap left-1/2 top-1/2" style={{ animationDelay: "0.7s", opacity: 0 }} />}
                  </span>
                )}
                {clockedIn && b >= 2 && people.filter((p) => p !== me && p.hours[TODAY]).length > 0 && (
                  <p className="mt-3 text-xs text-gray-500">
                    On the clock:{" "}
                    {people
                      .filter((p) => p !== me && p.hours[TODAY])
                      .map((p) => p.name)
                      .join(", ")}
                  </p>
                )}
              </DsCard>
            </div>
            <DsCard className="p-4">
              <p className="mb-3 text-[14.5px] font-semibold">Client</p>
              <p className="text-sm font-semibold text-gray-900">{jobClient}</p>
              <p className="text-xs text-gray-500">412 Oak Ln, Plano, TX 75074</p>
            </DsCard>
          </div>
        </PhoneApp>
      </div>

      {/* the desk: Timesheets, then the job's Profit margin */}
      <div className="min-w-0 flex-1 max-sm:hidden">
        <WBAppFrame nav={onJobPage ? "Jobs" : "Timesheets"} height={472} sidebarFrom="xl">
          <div className="absolute inset-0 overflow-hidden" style={{ ...FONT, background: BW.canvas, color: BW.ink }}>
            {!onJobPage ? (
              <div ref={sheetRef} className="h-full overflow-hidden px-6 py-6">
                <div className="mx-auto max-w-[56rem]">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[30px] font-[650] leading-[1.12] tracking-[-0.022em]">Timesheets</p>
                      <p className="mt-1.5 text-[13.5px]" style={{ color: BW.muted }}>
                        Team hours · week of {weekOf}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-lg p-2 text-gray-500">
                        <ChevronLeft size={16} />
                      </span>
                      <span className="rounded-lg p-2 text-gray-500">
                        <ChevronRight size={16} />
                      </span>
                      <span className="ml-1 flex items-center gap-1.5 rounded-[12px] border bg-white px-3 py-1.5 text-xs font-semibold text-gray-800" style={{ borderColor: BW.lineStrong }}>
                        <Download size={13} />
                        Export
                      </span>
                    </div>
                  </div>
                  <div className="mb-5">
                    <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: BW.primary }}>
                      <Plus size={14} />
                      Add time entry
                    </span>
                  </div>
                  <div className="space-y-5">
                    {groups.map((g) => {
                      const total = g.entries.reduce((s, e) => s + e.min, 0);
                      return (
                        <div key={g.p.name} ref={g.p === me ? myCardRef : undefined}>
                          <DsCard className="overflow-hidden">
                            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: BW.line }}>
                              <p className="text-sm font-semibold text-gray-900">{g.p.name}</p>
                              <span className="text-sm font-semibold tabular-nums text-gray-900">{dur(total)}</span>
                            </div>
                            <div>
                              {g.entries.map((e, k) => (
                                <div key={e.day} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${k ? "border-t" : ""} ${e.day === TODAY ? "wb-row-in" : ""}`} style={{ borderColor: BW.line }}>
                                  <span className="w-24 flex-none text-xs font-medium text-gray-500">{DAYS[e.day]}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium text-gray-900">{jobTitle}</p>
                                    <p className="text-xs text-gray-500">
                                      {clock(e.start)}
                                      {e.open ? "" : ` – ${clock(e.start + e.min)}`}
                                    </p>
                                  </div>
                                  <MapPin size={14} className="flex-none text-gray-400" />
                                  <span className="w-16 flex-none text-right font-semibold tabular-nums" style={{ color: e.open ? BW.good : "#111827" }}>
                                    {dur(e.min)}
                                  </span>
                                  {e.open && (
                                    <span className="relative flex h-2 w-2 flex-none">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: BW.good }} />
                                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: BW.good }} />
                                    </span>
                                  )}
                                  <span className="flex-none p-1.5 text-gray-300">
                                    <Pencil size={13} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          </DsCard>
                        </div>
                      );
                    })}
                    {groups.length > 1 && (
                      <div className="flex justify-end px-1 text-sm">
                        <span className="mr-2 text-gray-500">Team total</span>
                        <span className="font-semibold tabular-nums text-gray-900">{dur(grand)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div key="job" className="wb-step-in h-full overflow-hidden px-6 py-6">
                <div className="mx-auto max-w-[56rem]">
                  <div className="mb-4 flex items-center gap-3">
                    <ArrowLeft size={18} className="text-gray-400" />
                    <DsChip tone="good">Active</DsChip>
                  </div>
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[30px] font-[650] leading-[1.12] tracking-[-0.022em]">{jobTitle}</p>
                      <p className="text-sm font-semibold" style={{ color: BW.primary }}>
                        {jobClient}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 items-center gap-2 rounded-[12px] bg-white px-4 text-[14.5px] font-semibold" style={{ boxShadow: `inset 0 0 0 1px ${BW.lineStrong}` }}>
                        <PenLine size={14} /> Collect signature
                      </span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white" style={{ boxShadow: `inset 0 0 0 1px ${BW.lineStrong}`, color: BW.ink2 }}>
                        <MoreHorizontal size={16} />
                      </span>
                      <span className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-sm font-semibold text-white" style={{ background: BW.primary }}>
                        <CheckCircle size={13} /> Complete job
                      </span>
                    </div>
                  </div>
                  <div className="max-w-md space-y-4">
                    <DsCard className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
                        <div>
                          <span className="block text-xs font-medium text-gray-500">Job #</span>
                          <span className="text-gray-800">318</span>
                        </div>
                        <div>
                          <span className="block text-xs font-medium text-gray-500">Scheduled</span>
                          <span className="flex items-center gap-1.5 font-semibold" style={{ color: BW.primary }}>
                            <CalendarDays size={14} /> Oct 26, 8:00 AM
                          </span>
                        </div>
                      </DsCard>
                    <div className="space-y-4">
                      <DsCard className="p-4">
                        <p className="mb-3 text-[14.5px] font-semibold">Profit margin</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Revenue</span>
                            <span className="text-gray-800">{money(revenue)}</span>
                          </div>
                          {materials > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Line item cost</span>
                              <span className="text-gray-800">−{money(materials)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-500">Labor ({dur(laborMin)})</span>
                            <span className="tabular-nums text-gray-800">−{money(shownLabor)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
                            <span className="text-gray-900">Profit</span>
                            <span className="tabular-nums" style={{ color: profit >= 0 ? BW.good : BW.bad }}>
                              {money(profit)}
                              {revenue > 0 && ` (${Math.round((profit / revenue) * 100)}%)`}
                            </span>
                          </div>
                        </div>
                      </DsCard>
                      <DsCard className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[14.5px] font-semibold">Billing</p>
                          <span className="text-xs font-semibold" style={{ color: BW.primary }}>
                            + Create Invoice
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">No invoice yet.</p>
                      </DsCard>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </WBAppFrame>
      </div>
    </div>
  );
}
