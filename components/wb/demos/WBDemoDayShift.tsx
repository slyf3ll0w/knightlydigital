"use client";

import { useEffect, useRef } from "react";
import {
  CalendarClock,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Columns3,
  CloudRain,
  Loader2,
  MessageSquare,
  MousePointer2,
  Plus,
  Route as RouteIcon,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import { Title } from "@/components/wb/WBAppJourney";
import "../wb-open.css";
import { FilterChip, Segment, SegmentedRow } from "@/components/FilterChips";
import TimeGrid, { type GridColumn } from "@/app/platform/schedule/TimeGrid";
import { TypeGlyph } from "@/app/platform/schedule/TypeGlyph";
import { HOUR_PX, durationLabel, fmtTime, initialsOf, itemTone, placeLabel, type ScheduleJobDTO, type WeekHours } from "@/app/platform/schedule/schedule-lib";
import type { useCalendarDrag } from "@/app/platform/schedule/useCalendarDrag";
import WBAppFrame, { PhoneApp } from "./WBAppFrame";
import { Fit, Phone, useNarrow, parseTime, useDemoLoop } from "./kit";

/**
 * The real Schedule, day view "By tech" (app/platform/schedule: the
 * dispatch board — the real TimeGrid, one column per tech), in the real
 * AppShell; on phones the real phone day view (date strip + agenda).
 *
 * The story, in the app's own moves: the owner drags a job to a later
 * slot (the item dims, the landing preview shows with its time badge),
 * drops it, and the calendar's real toast says "Moved <client>" with Undo
 * and "Text client"; a tap on Text client turns it to "Sent · Sent by
 * sms". Then the urgent request is dragged in from "Schedule someone" to
 * the freed slot and lands as a job ("Scheduled <client>").
 *
 * The app tells ONE client per move (the toast's Text client button); it
 * never re-times a tech's later jobs by itself, so the demo moves one job.
 * Rests on the finished day under reduced motion.
 */

export type DayJob = { time: string; client: string; title: string; tech?: string; /** length in hours, default 1 */ hours?: number };

const DEFAULT_JOBS: DayJob[] = [
  { time: "8:00a", client: "Maria Hernandez", title: "Panel inspection", tech: "Sam", hours: 1.5 },
  { time: "11:00a", client: "Derek Olsen", title: "Outlet repair", tech: "Sam" },
  { time: "1:00p", client: "Olivia Park", title: "EV charger install", tech: "Sam", hours: 2 },
  { time: "3:00p", client: "Marcus Bell", title: "Lighting upgrade", tech: "Sam" },
  { time: "9:00a", client: "Grace Kim", title: "Ceiling fan install", tech: "Jordan", hours: 2 },
  { time: "1:00p", client: "Nina Patel", title: "Smoke detectors", tech: "Jordan", hours: 1.5 },
  { time: "10:00a", client: "James Walker", title: "Quote walkthrough", tech: "Mike" },
  { time: "2:00p", client: "Alicia Grant", title: "Hot tub circuit", tech: "Mike", hours: 2 },
];
const DEFAULT_URGENT = { client: "Hannah Brooks", title: "No power in the kitchen" };

// Brightwire's team (the trade pages pass first names)
const FULL: Record<string, string> = { Sam: "Sam Whitaker", Jordan: "Jordan Reyes", Mike: "Mike Delgado", Jess: "Jess Moreno" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thursday, Oct 29" → that day in 2026 (Oct 29 if it can't be read). */
function dayOf(label: string): Date {
  const m = label.match(/([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})/);
  const mon = m ? MONTHS.indexOf(m[1]) : -1;
  return new Date(2026, mon >= 0 ? mon : 9, m ? Number(m[2]) : 29);
}
/** Clock times on the trade pages come without a/p ("1:00"): a working day reads 1–6 as afternoon. */
function startMin(t: string): number {
  const m = parseTime(t);
  return /[ap]/i.test(t) ? m : m < 7 * 60 ? m + 12 * 60 : m;
}
const at = (day: Date, min: number) => {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(min);
  return d;
};

// beats: 1 drag the job · 2 dropped + toast · 3 Text client pressed · 4 sent ·
// 5 drag the urgent request in · 6 placed + toast
const TIMES = [900, 2300, 3700, 4300, 5900, 7300];
const CYCLE = 11000;
const OPEN: WeekHours = Array.from({ length: 7 }, () => [{ start: 7 * 60, end: 17 * 60 }]);

export default function WBDemoDayShift({
  jobs = DEFAULT_JOBS,
  urgent = DEFAULT_URGENT,
  day = "Thursday, Oct 29",
}: {
  jobs?: DayJob[];
  urgent?: { client: string; title: string };
  day?: string;
} = {}) {
  const { ref, b } = useDemoLoop(TIMES, CYCLE);
  const date = dayOf(day);

  const techs = Array.from(new Set(jobs.map((j) => j.tech ?? "Mike")));
  const users = techs.map((t) => ({ id: t, name: FULL[t] ?? t }));
  const base = jobs.map((j, k) => {
    const s = startMin(j.time);
    return { ...j, k, s, e: s + Math.round((j.hours ?? 1) * 60), tech: j.tech ?? "Mike" };
  });
  // The job that makes room: the earliest one starting at 11:00 or later
  const moved = [...base].filter((r) => r.s >= 11 * 60).sort((a, b) => a.s - b.s)[0] ?? base[base.length - 1];
  const len = moved.e - moved.s;
  const slot = moved.s; // the urgent job takes its slot
  const newStart = moved.s + 60;

  const dropped = b >= 2;
  const placed = b >= 6;
  const items: ScheduleJobDTO[] = base.map((r) => {
    const s = r.k === moved.k && dropped ? newStart : r.s;
    return job(`j${r.k}`, r.client, r.title, date, s, s + (r.e - r.s), r.tech, FULL[r.tech] ?? r.tech, 1040 + r.k);
  });
  if (placed) items.push(job("urgent", urgent.client, urgent.title, date, slot, slot + 60, moved.tech, FULL[moved.tech] ?? moved.tech, 1052));

  const movedItem = items.find((i) => i.id === `j${moved.k}`)!;
  const dragState =
    b === 1
      ? {
          source: { type: "item", item: movedItem, mode: "move", grabOffsetMin: 0, fromUserId: moved.tech },
          x: 0,
          y: 0,
          target: { type: "slot", date, minute: newStart, userId: moved.tech },
          durationMin: len,
          endMinute: null,
          touch: false,
        }
      : b === 5
        ? {
            source: { type: "palette", entity: { type: "request", id: "r1", title: urgent.title, contactId: "c1", name: urgent.client, address: null, phone: null, preferredDate: null, sub: urgent.title } },
            x: 0,
            y: 0,
            target: { type: "slot", date, minute: slot, userId: moved.tech },
            durationMin: 60,
            endMinute: null,
            touch: false,
          }
        : null;

  const toast: View["toast"] =
    b >= 2 && b < 5
      ? {
          text: `Moved ${moved.client}`,
          sub: b >= 4 ? "Sent by sms" : placeLabel(date, newStart, len),
          notify: b >= 4 ? "sent" : b === 3 ? "busy" : "idle",
        }
      : b >= 6
        ? { text: `Scheduled ${urgent.client}`, sub: placeLabel(date, slot, 60), notify: null }
        : null;

  const view = { date, users, items, dragState, toast, movingId: b === 1 ? movedItem.id : null, b, slot, newStart, movedTech: moved.tech };
  const wide = useNarrow(560);
  return (
    <div ref={ref}>
      <div ref={wide.ref}>
      <div className={wide.narrow ? "hidden" : "max-lg:hidden"}>
        <WBAppFrame nav="Schedule" real height={740} designWidth={1400}>
          <DesktopDay {...view} />
        </WBAppFrame>
      </div>
      <div className={wide.narrow ? "flex justify-center" : "flex justify-center lg:hidden"}>
        <Phone width={300} height={620} ios>
          <Fit width={390}>
            <PhoneApp tab="Schedule" height={Math.round(((620 - 74) * 390) / 282)}>
              <PhoneDay {...view} />
            </PhoneApp>
          </Fit>
        </Phone>
      </div>
      </div>
    </div>
  );
}

function job(id: string, client: string, title: string, day: Date, s: number, e: number, techId: string, techName: string, no: number): ScheduleJobDTO {
  return {
    id,
    kind: "job",
    jobNumber: no,
    title,
    status: "ACTIVE",
    apptType: null,
    scheduledAt: at(day, s).toISOString(),
    scheduledEnd: at(day, e).toISOString(),
    scheduledAnytime: false,
    contactName: client,
    assignees: [techName],
    assigneeIds: [techId],
    phone: "555-0100",
  };
}

type View = {
  date: Date;
  users: { id: string; name: string }[];
  items: ScheduleJobDTO[];
  dragState: unknown;
  toast: { text: string; sub: string; notify: "idle" | "busy" | "sent" | null } | null;
  movingId: string | null;
  b: number;
  slot: number;
  newStart: number;
  movedTech: string;
};

/* ── Desktop: app/platform/schedule, day view, By tech ─────────────────── */

function DesktopDay({ date, users, items, dragState, toast, b, newStart, slot, movedTech }: View) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The grid opens a couple of hours before the slot the story is about
  const firstHour = Math.min(12, Math.max(7, Math.floor(slot / 60) - 2));
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = firstHour * HOUR_PX;
  });
  const today = at(date, 10 * 60 + 40);
  const booked = (list: ScheduleJobDTO[]) =>
    list.reduce((s, it) => s + Math.round((new Date(it.scheduledEnd!).getTime() - new Date(it.scheduledAt!).getTime()) / 60000), 0);
  const columns: GridColumn[] = users.map((u) => ({
    key: `u-${u.id}`,
    date,
    userId: u.id,
    label: u.name,
    sub: `${durationLabel(booked(items.filter((it) => it.assigneeIds?.includes(u.id))))} booked`,
    isToday: true,
  }));
  const noop = () => ({});
  const drag = { state: dragState, selection: null, handleProps: noop, resizeProps: noop, selectProps: noop, cancel: () => {} } as unknown as ReturnType<typeof useCalendarDrag>;
  const colIdx = users.findIndex((u) => u.id === movedTech);
  const cursorMin = b === 1 ? newStart : slot;

  return (
    <div className="wb-open mx-auto w-full max-w-6xl px-8 pb-10 pt-8">
      <div className="mb-6 flex items-end justify-between gap-2">
        <Title eyebrow="Tuesday · 6 jobs, the first at 8:00">Schedule</Title>
        <div className="flex items-center gap-2">
          <span className="ds-btn ds-btn-outline relative">
            <UserPlus size={16} />
            Schedule someone
            {b < 6 && <span className="static min-w-[18px] rounded-full bg-[color:var(--ds-warn-soft)] px-1 py-px text-center text-[11px] font-bold text-[color:var(--ds-warn)]">1</span>}
          </span>
          <span className="ds-btn ds-btn-outline">
            <CalendarOff size={16} />
            Block time
          </span>
          <span className="ds-btn ds-btn-outline">
            <CloudRain size={16} />
            Move the day
          </span>
          <span className="ds-btn ds-btn-ghost">
            <CalendarClock size={16} />
            New appointment
          </span>
          <span className="ds-btn ds-btn-primary">
            <Plus size={15} />
            New job
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-1">
          <span className="rounded-full p-2">
            <ChevronLeft size={18} className="text-gray-600" />
          </span>
          <span className="rounded-full p-2">
            <ChevronRight size={18} className="text-gray-600" />
          </span>
          <span className="ds-btn ds-btn-outline ds-btn-sm">Today</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
        {b === 3 && <Loader2 size={15} className="animate-spin text-gray-400" />}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1.5">
            {["Month", "Week", "Day"].map((v) => (
              <FilterChip key={v} hue="" active={v === "Day"}>
                {v}
              </FilterChip>
            ))}
            <FilterChip hue="" active>
              <Columns3 size={14} />
              By tech
            </FilterChip>
            <FilterChip hue="" active={false}>
              <RouteIcon size={14} />
              Map
            </FilterChip>
          </div>
          <span className="min-w-0 rounded-[10px] border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700">All team members</span>
        </div>
      </div>

      <div className="wb-demo-grid relative">
        <TimeGrid columns={columns} itemsFor={(c) => items.filter((it) => it.assigneeIds?.includes(c.userId ?? ""))} hours={OPEN} today={today} mounted scrollRef={scrollRef} drag={drag} onOpen={() => {}} wide />
        {(b === 1 || b === 5) && colIdx >= 0 && (
          // the pointer doing the drag (the app keeps the mouse cursor; no card)
          <MousePointer2
            className="pointer-events-none absolute z-30 fill-white text-gray-900"
            size={20}
            style={{
              left: `calc(56px + (100% - 56px) * ${(colIdx + 0.55) / users.length})`,
              top: 52 + 44 + ((cursorMin - firstHour * 60) / 60) * HOUR_PX + 18,
            }}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {[
          ["bg-[color:var(--ds-primary)]", "Active job"],
          ["bg-[color:var(--ds-warn)]", "Requires invoicing"],
          ["bg-[color:var(--ds-secondary)]", "Appointment"],
          ["bg-gray-400", "Closed"],
          ["bg-blocked border border-gray-400", "Blocked off"],
        ].map(([c, label]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`h-2.5 w-2.5 rounded-lg ${c}`} />
            {label}
          </div>
        ))}
      </div>
      {toast && <DeskToast toast={toast} />}
    </div>
  );
}

/** UndoToast (app/platform/schedule/UndoToast.tsx), desktop row. */
function DeskToast({ toast }: { toast: NonNullable<View["toast"]> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div key={toast.text} className="wb-toast-in flex w-auto flex-row items-center gap-3 rounded-[14px] bg-gray-900 px-4 py-2.5 text-sm text-white shadow-[0_10px_30px_rgba(9,13,19,0.3)]">
        <div className="min-w-0">
          <p className="truncate font-medium leading-snug">{toast.text}</p>
          <p className="truncate text-xs leading-snug opacity-75">{toast.sub}</p>
        </div>
        <ToastActions toast={toast} phone={false} />
        <X size={14} className="shrink-0 opacity-60" />
      </div>
    </div>
  );
}

function ToastActions({ toast, phone }: { toast: NonNullable<View["toast"]>; phone: boolean }) {
  const h = phone ? "h-9 px-3 text-[13px]" : "h-8 px-2.5 text-xs";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className={`flex items-center gap-1.5 rounded-[10px] bg-white/12 font-semibold ${h}`}>
        <Undo2 size={14} />
        Undo
      </span>
      {toast.notify && (
        <span
          className={`relative flex items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--ds-primary)] font-semibold text-[color:var(--ds-on-primary)] ${h} ${phone ? "flex-1" : "flex-none"} ${toast.notify !== "idle" ? "opacity-60" : ""}`}
        >
          {toast.notify === "busy" ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
          {toast.notify === "sent" ? "Sent" : "Text client"}
          {toast.notify === "busy" && <span className="wb-demo-tap left-1/2 top-1/2" />}
        </span>
      )}
    </div>
  );
}

/* ── Phone: the day view's date strip + agenda ─────────────────────────── */

function PhoneDay({ date, items, toast, movingId }: View) {
  const list = [...items].sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() - date.getDay() + i);
    return d;
  });
  const first = list[0];
  return (
    <div className="relative h-full p-4">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h1 className="ds-title !text-[28px]">Schedule</h1>
        <div className="flex items-center gap-2">
          {[UserPlus, CalendarOff, CloudRain].map((I, k) => (
            <span key={k} className="btn-tool-line relative flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-gray-700">
              <I size={16} />
              {k === 0 && !items.some((i) => i.id === "urgent") && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[color:var(--ds-warn)] px-1 py-px text-center text-[11px] font-bold text-[color:var(--ds-surface)]">1</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="mb-2.5 flex items-center gap-1">
        <span className="-ml-1.5 shrink-0 rounded-full p-2">
          <ChevronLeft size={20} className="text-gray-500" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-gray-900">Today</h2>
        <span className="shrink-0 rounded-full p-2">
          <ChevronRight size={20} className="text-gray-500" />
        </span>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <SegmentedRow className="min-w-0 flex-1">
          {["Day", "Week", "Month"].map((v) => (
            <Segment key={v} active={v === "Day"}>
              {v}
            </Segment>
          ))}
          <Segment active={false}>
            <RouteIcon size={13} />
            Map
          </Segment>
        </SegmentedRow>
        <span className="max-w-[128px] shrink-0 rounded-[10px] border border-gray-200 bg-white py-2 pl-3 pr-2 text-[13px] font-medium text-gray-700">Everyone</span>
      </div>
      <div className="ds-card mb-3 flex overflow-hidden">
        {days.map((d, i) => {
          const selected = d.getDate() === date.getDate();
          return (
            <span key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{"SMTWTFS"[d.getDay()]}</span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-semibold"
                style={selected ? { backgroundColor: "var(--ds-primary)", color: "var(--ds-on-primary)" } : undefined}
              >
                {d.getDate()}
              </span>
              <span className="flex h-1.5 items-center gap-[3px]">
                {selected &&
                  [0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--ds-primary)" }} />)}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mb-2.5 px-0.5 text-[13px] font-medium text-gray-500">
        {list.length} on the schedule{first ? ` · first at ${fmtTime(new Date(first.scheduledAt!))}` : ""}
      </p>
      <ul className="space-y-2">
        {list.slice(0, 7).map((it) => (
          <li key={it.id} className={it.id === "urgent" ? "wb-row-in" : ""}>
            <span className={`flex w-full items-stretch gap-2.5 text-left transition-opacity ${movingId === it.id ? "opacity-40" : ""}`}>
              <span className="w-[56px] shrink-0 pt-2 text-right">
                <span className="numeral-ledger block text-[13px] font-semibold text-gray-900">{fmtTime(new Date(it.scheduledAt!))}</span>
                <span className="numeral-ledger block text-[11px] text-gray-400">{fmtTime(new Date(it.scheduledEnd!))}</span>
              </span>
              <span className={`flex min-w-0 flex-1 items-center gap-2 rounded-[16px] border-l-[3px] px-3 py-2.5 shadow-[0_1px_2px_rgba(9,13,19,0.08)] ${itemTone(it)}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    <TypeGlyph apptType={it.apptType} recurring={it.recurring} size={13} />
                    <span className="truncate">{it.contactName}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] opacity-80">
                    {it.title} · #{it.jobNumber}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 self-center">
                  {(it.assignees ?? []).slice(0, 2).map((n, k) => (
                    <span key={k} className="flex h-6 w-6 items-center justify-center rounded-full text-[9.5px] font-bold" style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}>
                      {initialsOf(n)}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-[60] flex justify-center px-3">
          <div key={toast.text} className="wb-toast-in flex w-full max-w-[560px] flex-col gap-2 rounded-[14px] bg-gray-900 px-4 py-3 text-sm text-white shadow-[0_10px_30px_rgba(9,13,19,0.3)]">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{toast.text}</p>
                <p className="text-xs leading-snug opacity-75">{toast.sub}</p>
              </div>
              <X size={16} className="-mr-1 -mt-0.5 shrink-0 opacity-60" />
            </div>
            <ToastActions toast={toast} phone />
          </div>
        </div>
      )}
    </div>
  );
}
