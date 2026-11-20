"use client";

import { Inbox, Zap } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { Chip, PageHead, Toast, fmtTime, parseTime, useDemoLoop } from "./kit";

/**
 * Schedule, day view: an urgent request lands, drops into the 11:00 slot
 * with a Priority chip, the tech's later jobs slide down an hour, and the
 * clients whose times moved are told by text. Loops while on screen; rests
 * on the moved day under reduced motion.
 */

export type DayJob = { time: string; client: string; title: string; tech?: string; /** length in hours, default 1 */ hours?: number };

const DEFAULT_JOBS: DayJob[] = [
  { time: "8:00a", client: "Maria Hernandez", title: "Panel inspection", tech: "Sam", hours: 1.5 },
  { time: "11:00a", client: "Derek Olsen", title: "Outlet repair", tech: "Sam" },
  { time: "1:00p", client: "Olivia Park", title: "EV charger install", tech: "Sam", hours: 2 },
  { time: "3:00p", client: "Marcus Bell", title: "Lighting upgrade", tech: "Sam" },
  { time: "9:00a", client: "Grace Kim", title: "Ceiling fan install", tech: "Jess", hours: 2 },
  { time: "1:00p", client: "Nina Patel", title: "Smoke detectors", tech: "Jess", hours: 1.5 },
  { time: "10:00a", client: "James Walker", title: "Quote walkthrough", tech: "Mike" },
  { time: "2:00p", client: "Alicia Grant", title: "Hot tub circuit", tech: "Mike", hours: 2 },
];
const DEFAULT_URGENT = { client: "Hannah Brooks", title: "No power in the kitchen" };

const START = 7 * 60;
const END = 18 * 60; // the 5p row runs to 6
const ROW = 30;
const HOURS = Array.from({ length: (END - START) / 60 }, (_, k) => START + k * 60);
const URGENT_AT = 11 * 60;

export default function WBDemoDayShift({
  jobs = DEFAULT_JOBS,
  urgent = DEFAULT_URGENT,
  day = "Thursday, Oct 29",
}: {
  jobs?: DayJob[];
  urgent?: { client: string; title: string };
  day?: string;
} = {}) {
  const { ref, b } = useDemoLoop([700, 2300, 3700], 9200);

  const techs = Array.from(new Set(jobs.map((j) => j.tech ?? "Today")));
  const rows = jobs.map((j, k) => {
    const start = parseTime(j.time);
    return { ...j, k, col: techs.indexOf(j.tech ?? "Today"), start, end: start + Math.round((j.hours ?? 1) * 60) };
  });
  // the urgent job goes to the column with work at 11:00 or later (so the push-down shows)
  const target = Math.max(0, rows.find((r) => r.start >= URGENT_AT)?.col ?? 0);
  const inCol = rows.filter((r) => r.col === target);
  const urgentStart = Math.max(URGENT_AT, ...inCol.filter((r) => r.start < URGENT_AT).map((r) => r.end));
  const shiftFor = (r: (typeof rows)[number]) => (r.col === target && r.start >= urgentStart ? 60 : 0);
  const moved = rows.filter((r) => shiftFor(r) > 0).length;

  const placed = b >= 2;
  const top = (min: number) => ((min - START) / 60) * ROW;
  const colStyle = (col: number) =>
    ({
      ["--c0" as string]: col,
      left: "calc(42px + (100% - 42px) * var(--c, var(--c0)) / var(--cols, var(--cols0)) + 3px)",
      width: "calc((100% - 42px) / var(--cols, var(--cols0)) - 6px)",
    }) as React.CSSProperties;
  // phones show only the column the urgent job lands in
  const colCls = (col: number) => (col === target ? "max-sm:[--c:0]" : "max-sm:hidden");

  return (
    <div ref={ref}>
      <WBAppFrame nav="Schedule" height={452}>
        <PageHead
          sub={day}
          title="Schedule"
          right={
            <span className="flex overflow-hidden rounded-lg bg-white text-[11px] font-semibold ring-1 ring-[#E3E6EC]">
              <span className="px-3 py-1.5 text-white" style={{ background: "#1D2E52" }}>
                Day
              </span>
              <span className="px-3 py-1.5 text-gray-600">Week</span>
            </span>
          }
        />
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white max-sm:[--cols:1]" style={{ ["--cols0" as string]: techs.length } as React.CSSProperties}>
          <div className="grid border-b border-[#EEF0F3] text-[10.5px] font-semibold text-gray-600" style={{ gridTemplateColumns: "42px repeat(var(--cols, var(--cols0)), 1fr)" }}>
            <span />
            {techs.map((t, i) => (
              <span key={t} className={`flex items-center gap-1.5 border-l border-[#F0F2F5] px-2 py-2 ${i !== target ? "max-sm:hidden" : ""}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3E5277] text-[8.5px] text-white">{t[0]}</span>
                {t}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: HOURS.length * ROW }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute inset-x-0 border-b border-[#F3F4F7]" style={{ top: top(h), height: ROW }}>
                <span className="block w-[42px] pr-1.5 pt-1 text-right text-[9px] text-gray-400">{fmtTime(h).replace(":00", "")}</span>
              </div>
            ))}
            {techs.map((t, i) => (
              <div key={t} className={`absolute bottom-0 top-0 border-l border-[#F0F2F5] ${colCls(i)}`} style={{ ["--c0" as string]: i, left: "calc(42px + (100% - 42px) * var(--c, var(--c0)) / var(--cols, var(--cols0)))" } as React.CSSProperties} />
            ))}
            {rows.map((r) => {
              const dy = placed ? shiftFor(r) : 0;
              return (
                <div
                  key={r.k}
                  className={`absolute overflow-hidden rounded-md border px-1.5 py-[1px] text-[9.5px] leading-[11px] transition-[top,background-color,border-color] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${colCls(r.col)} ${dy && b >= 3 ? "border-[#9FB6E0] bg-[#DCE6FA]" : "border-[#C9D3E6] bg-[#E8EEFB]"}`}
                  style={{ ...colStyle(r.col), top: top(r.start + dy) + 2, height: ((r.end - r.start) / 60) * ROW - 4 }}
                >
                  <span className="block truncate font-semibold text-[#22406E]">
                    {fmtTime(r.start + dy)} · {r.client}
                  </span>
                  <span className="block truncate text-[#3E5277]">{r.title}</span>
                </div>
              );
            })}
            {placed && (
              <div
                className="wb-drop-cal max-sm:[--c:0] absolute z-10 overflow-hidden rounded-md border-2 border-[#F86A0A] bg-[#FFF1E6] px-1.5 py-0 text-[9.5px] leading-[11px]"
                style={{ ...colStyle(target), top: top(urgentStart) + 2, height: ROW - 4 }}
              >
                <span className="flex items-center gap-1 truncate font-bold text-[#9A3412]">
                  {fmtTime(urgentStart)} · {urgent.client}
                </span>
                <span className="block truncate text-[#C2410C]">{urgent.title}</span>
              </div>
            )}
            {placed && (
              <span className="wb-pop-in absolute z-10 max-sm:[--c:0]" style={{ ["--c0" as string]: target, left: "calc(42px + (100% - 42px) * (var(--c, var(--c0)) + 1) / var(--cols, var(--cols0)) - 66px)", top: top(urgentStart) - 8 } as React.CSSProperties}>
                <Chip tone="orange">
                  <Zap className="h-2.5 w-2.5" /> Priority
                </Chip>
              </span>
            )}
          </div>

          {b === 1 && (
            <div className="wb-toast-in absolute right-3 top-11 z-20 flex w-[250px] items-start gap-2.5 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_18px_34px_-18px_rgba(10,20,40,0.5)]">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#F86A0A] text-white">
                <Inbox className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-gray-900">New request · {urgent.client}</span>
                <span className="block truncate text-[10.5px] text-[#C2410C]">{urgent.title} · Today, urgent</span>
              </span>
            </div>
          )}
          {b >= 3 && moved > 0 && (
            <Toast className="bottom-3 right-3">
              {moved} {moved === 1 ? "client got their" : "clients got their"} new times by text
            </Toast>
          )}
        </div>
      </WBAppFrame>
    </div>
  );
}
