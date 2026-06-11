"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Month / Week / Day calendar with an "Anytime" all-day row, an
 * unscheduled-jobs drawer, and drag-to-(re)schedule. Mirrors Jobber's
 * schedule layout (build spec §6) without the map/route extras.
 *
 * Drag rules:
 *  - drop on an hour cell  → starts at that hour, keeps the job's previous
 *    duration (default 1h), clears "anytime"
 *  - drop on the Anytime row / a month day cell with no previous time
 *    → date-only ("anytime", anchored at noon like other date-only fields)
 *  - drop on a month day cell when the job had a time → keeps that time
 */

export type ScheduleJobDTO = {
  id: string;
  jobNumber: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  contactName: string;
};

type View = "month" | "week" | "day";

const HOUR_PX = 48;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Tinted blocks reusing the lifecycle tones (green=active, amber=needs
// invoicing, gray=archived) so the calendar scans like the rest of the app.
const blockTone: Record<string, string> = {
  ACTIVE: "border-green-500 bg-green-100 text-green-900 hover:bg-green-200",
  REQUIRES_INVOICING: "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200",
  ARCHIVED: "border-gray-400 bg-gray-100 text-gray-600 hover:bg-gray-200",
};
const dotTone: Record<string, string> = {
  ACTIVE: "bg-green-500",
  REQUIRES_INVOICING: "bg-amber-500",
  ARCHIVED: "bg-gray-400",
};

const pad = (n: number) => String(n).padStart(2, "0");
const toParam = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseParam(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/** Greedy column layout so overlapping blocks share the day column. */
function layoutTimed(jobs: ScheduleJobDTO[], day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const events = jobs
    .map((j) => {
      const s = new Date(j.scheduledAt!);
      const startMin = Math.max(0, (s.getTime() - dayStart.getTime()) / 60000);
      const rawEnd = j.scheduledEnd
        ? (new Date(j.scheduledEnd).getTime() - dayStart.getTime()) / 60000
        : startMin + 60;
      const endMin = Math.min(24 * 60, Math.max(startMin + 30, rawEnd));
      return { j, startMin, endMin, col: 0, cols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Cluster transitively-overlapping events, then assign columns greedily
  let cluster: typeof events = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    for (const ev of cluster) {
      let col = colEnds.findIndex((end) => end <= ev.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = ev.endMin;
      ev.col = col;
    }
    for (const ev of cluster) ev.cols = colEnds.length;
    cluster = [];
  };
  for (const ev of events) {
    if (cluster.length && ev.startMin >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return events;
}

export default function ScheduleClient({
  view,
  date,
  team,
  jobs,
  unscheduled,
  users,
  canCreateJob = true,
}: {
  view: View;
  date: string;
  team: string;
  jobs: ScheduleJobDTO[];
  unscheduled: ScheduleJobDTO[];
  users: { id: string; name: string }[];
  canCreateJob?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const anchor = useMemo(() => parseParam(date), [date]);
  const today = useMemo(() => new Date(), []);

  useEffect(() => setMounted(true), []);

  // Open week/day on business hours instead of midnight
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, [view, date]);

  function go(next: { view?: View; date?: Date; team?: string }) {
    const v = next.view ?? view;
    const params = new URLSearchParams();
    params.set("view", v);
    params.set("date", toParam(next.date ?? anchor));
    const t = next.team !== undefined ? next.team : team;
    if (t) params.set("team", t);
    startTransition(() => router.push(`/app/schedule?${params.toString()}`));
  }

  function step(dir: 1 | -1) {
    if (view === "month") {
      go({ date: new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) });
    } else {
      go({ date: addDays(anchor, dir * (view === "week" ? 7 : 1)) });
    }
  }

  const allJobs = useMemo(() => {
    const map = new Map<string, ScheduleJobDTO>();
    for (const j of [...jobs, ...unscheduled]) map.set(j.id, j);
    return map;
  }, [jobs, unscheduled]);

  async function scheduleDrop(jobId: string, day: Date, hour: number | "anytime") {
    const job = allJobs.get(jobId);
    if (!job) return;
    setHoverKey(null);
    setDragId(null);

    let startD: Date;
    let endD: Date | null = null;
    let anytime: boolean;

    if (hour === "anytime") {
      startD = new Date(day);
      startD.setHours(12, 0, 0, 0); // date-only convention: anchor at noon
      anytime = true;
    } else if (hour === -1) {
      // month-cell drop: keep the previous time of day if the job had one
      if (job.scheduledAt && !job.scheduledAnytime) {
        const prev = new Date(job.scheduledAt);
        startD = new Date(day);
        startD.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
        anytime = false;
      } else {
        startD = new Date(day);
        startD.setHours(12, 0, 0, 0);
        anytime = true;
      }
    } else {
      startD = new Date(day);
      startD.setHours(hour, 0, 0, 0);
      anytime = false;
    }

    if (!anytime) {
      const prevDur =
        job.scheduledAt && job.scheduledEnd && !job.scheduledAnytime
          ? new Date(job.scheduledEnd).getTime() - new Date(job.scheduledAt).getTime()
          : 60 * 60000;
      endD = new Date(startD.getTime() + Math.max(30 * 60000, prevDur));
    }

    setSaving(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/jobs/${jobId}`,
      {
        scheduledAt: startD.toISOString(),
        scheduledEnd: endD ? endD.toISOString() : null,
        scheduledAnytime: anytime,
      },
      "PATCH"
    );
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    startTransition(() => router.refresh());
  }

  function dragProps(job: ScheduleJobDTO) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", job.id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(job.id);
      },
      onDragEnd: () => {
        setDragId(null);
        setHoverKey(null);
      },
    };
  }

  function dropProps(key: string, day: Date, hour: number | "anytime") {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (hoverKey !== key) setHoverKey(key);
      },
      onDragLeave: () => {
        if (hoverKey === key) setHoverKey(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = dragId ?? e.dataTransfer.getData("text/plain");
        if (id) scheduleDrop(id, day, hour);
      },
    };
  }

  const openJob = (id: string) => router.push(`/app/jobs/${id}`);

  // ── Header label ──────────────────────────────────────────────────────────
  let rangeLabel: string;
  if (view === "month") {
    rangeLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  } else if (view === "week") {
    const ws = addDays(anchor, -anchor.getDay());
    const we = addDays(ws, 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    rangeLabel = `${fmt(ws)} – ${fmt(we)}, ${we.getFullYear()}`;
  } else {
    rangeLabel = anchor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const weekDays =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(addDays(anchor, -anchor.getDay()), i))
      : [anchor];

  // ── Renderers ─────────────────────────────────────────────────────────────

  function renderMonth() {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const jobsByDay: Record<number, ScheduleJobDTO[]> = {};
    for (const job of jobs) {
      if (!job.scheduledAt) continue;
      const d = new Date(job.scheduledAt);
      if (d.getMonth() !== m || d.getFullYear() !== y) continue;
      (jobsByDay[d.getDate()] ??= []).push(job);
    }

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push(<div key={`e-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50 p-1 lg:min-h-[104px]" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(y, m, d);
      const isToday = sameDay(cellDate, today);
      const dayJobs = jobsByDay[d] ?? [];
      const key = `m-${d}`;
      cells.push(
        <div
          key={d}
          {...dropProps(key, cellDate, -1)}
          className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 transition-colors lg:min-h-[104px] ${
            hoverKey === key ? "bg-green-100/70 ring-2 ring-inset ring-green-400" : isToday ? "bg-green-50" : ""
          }`}
        >
          <button
            onClick={() => go({ view: "day", date: cellDate })}
            className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              isToday ? "bg-green-500 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {d}
          </button>
          <div className="space-y-0.5">
            {dayJobs.slice(0, 3).map((job) => (
              <div
                key={job.id}
                {...dragProps(job)}
                onClick={() => openJob(job.id)}
                className={`flex cursor-pointer items-center gap-1 truncate rounded border-l-2 px-1.5 py-0.5 text-xs font-medium ${blockTone[job.status] ?? blockTone.ARCHIVED}`}
                title={`${job.contactName} — ${job.title}`}
              >
                <span className="truncate">
                  {job.scheduledAnytime ? "" : `${fmtTime(new Date(job.scheduledAt!))} `}
                  {job.contactName} — {job.title}
                </span>
              </div>
            ))}
            {dayJobs.length > 3 && (
              <button
                onClick={() => go({ view: "day", date: cellDate })}
                className="pl-1 text-xs text-gray-400 hover:text-gray-600 hover:underline"
              >
                +{dayJobs.length - 3} more
              </button>
            )}
          </div>
        </div>
      );
    }
    const total = firstDow + daysInMonth;
    if (total % 7 > 0) {
      for (let i = 0; i < 7 - (total % 7); i++) {
        cells.push(<div key={`t-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50 p-1 lg:min-h-[104px]" />);
      }
    }

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">{cells}</div>
      </div>
    );
  }

  function renderTimeGrid() {
    const days = weekDays;
    const timed: Record<number, ScheduleJobDTO[]> = {};
    const anytime: Record<number, ScheduleJobDTO[]> = {};
    days.forEach((day, i) => {
      timed[i] = [];
      anytime[i] = [];
    });
    for (const job of jobs) {
      if (!job.scheduledAt) continue;
      const d = new Date(job.scheduledAt);
      const idx = days.findIndex((day) => sameDay(day, d));
      if (idx === -1) continue;
      (job.scheduledAnytime ? anytime : timed)[idx].push(job);
    }

    const gridCols = view === "week" ? "grid-cols-[56px_repeat(7,minmax(110px,1fr))]" : "grid-cols-[56px_minmax(0,1fr)]";
    const nowMin = today.getHours() * 60 + today.getMinutes();

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className={view === "week" ? "overflow-x-auto" : ""}>
          <div className={view === "week" ? "min-w-[840px]" : ""}>
            {/* Day headers */}
            <div className={`grid border-b border-gray-100 ${gridCols}`}>
              <div />
              {days.map((day, i) => {
                const isToday = sameDay(day, today);
                return (
                  <button
                    key={i}
                    onClick={() => view === "week" && go({ view: "day", date: day })}
                    className={`border-l border-gray-100 py-2 text-center ${view === "week" ? "hover:bg-gray-50" : "cursor-default"}`}
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {DAY_NAMES[day.getDay()]}
                    </span>
                    <span
                      className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-green-500 text-white" : "text-gray-900"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Anytime row */}
            <div className={`grid border-b border-gray-200 ${gridCols}`}>
              <div className="flex items-start justify-end px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Anytime</span>
              </div>
              {days.map((day, i) => {
                const key = `any-${i}`;
                return (
                  <div
                    key={i}
                    {...dropProps(key, day, "anytime")}
                    className={`min-h-[34px] space-y-0.5 border-l border-gray-100 p-1 transition-colors ${
                      hoverKey === key ? "bg-green-100/70 ring-2 ring-inset ring-green-400" : ""
                    }`}
                  >
                    {anytime[i].map((job) => (
                      <div
                        key={job.id}
                        {...dragProps(job)}
                        onClick={() => openJob(job.id)}
                        className={`cursor-pointer truncate rounded border-l-2 px-1.5 py-0.5 text-xs font-medium ${blockTone[job.status] ?? blockTone.ARCHIVED}`}
                        title={`${job.contactName} — ${job.title}`}
                      >
                        {job.contactName} — {job.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Hour grid */}
            <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100vh-21rem)]">
              <div className={`grid ${gridCols}`}>
                {/* Time gutter */}
                <div>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="relative border-b border-gray-50" style={{ height: HOUR_PX }}>
                      <span className="absolute -top-2 right-2 bg-white px-0.5 text-[10px] text-gray-400">
                        {h === 0 ? "" : hourLabel(h)}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Day columns */}
                {days.map((day, i) => {
                  const isToday = sameDay(day, today);
                  const blocks = layoutTimed(timed[i], day);
                  return (
                    <div key={i} className={`relative border-l border-gray-100 ${isToday ? "bg-green-50/40" : ""}`}>
                      {Array.from({ length: 24 }, (_, h) => {
                        const key = `h-${i}-${h}`;
                        return (
                          <div
                            key={h}
                            {...dropProps(key, day, h)}
                            className={`border-b border-gray-50 transition-colors ${
                              hoverKey === key ? "bg-green-100/70 ring-2 ring-inset ring-green-400" : ""
                            }`}
                            style={{ height: HOUR_PX }}
                          />
                        );
                      })}
                      {/* current-time line (client-only to avoid hydration drift) */}
                      {mounted && isToday && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-400"
                          style={{ top: (nowMin / 60) * HOUR_PX }}
                        >
                          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-400" />
                        </div>
                      )}
                      {blocks.map(({ j, startMin, endMin, col, cols }) => (
                        <div
                          key={j.id}
                          {...dragProps(j)}
                          onClick={() => openJob(j.id)}
                          className={`absolute cursor-pointer overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-xs font-medium shadow-sm ${blockTone[j.status] ?? blockTone.ARCHIVED}`}
                          style={{
                            top: (startMin / 60) * HOUR_PX + 1,
                            height: Math.max(22, ((endMin - startMin) / 60) * HOUR_PX - 2),
                            left: `calc(${(col / cols) * 100}% + 2px)`,
                            width: `calc(${(1 / cols) * 100}% - 4px)`,
                          }}
                          title={`${j.contactName} — ${j.title}`}
                        >
                          <span className="block truncate font-semibold">{j.contactName}</span>
                          <span className="block truncate">
                            {fmtTime(new Date(j.scheduledAt!))} · {j.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition-colors ${
              drawerOpen
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <CalendarDays size={15} />
            Unscheduled
            {unscheduled.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
                {unscheduled.length}
              </span>
            )}
          </button>
          {canCreateJob && (
            <Link
              href="/app/jobs/new"
              className="flex items-center gap-1.5 rounded bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
            >
              <Plus size={15} />
              New Job
            </Link>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded p-2 transition-colors hover:bg-gray-100" aria-label="Previous">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button onClick={() => step(1)} className="rounded p-2 transition-colors hover:bg-gray-100" aria-label="Next">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          <button
            onClick={() => go({ date: new Date() })}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Today
          </button>
        </div>

        <h2 className="text-base font-bold text-gray-900 lg:text-lg">{rangeLabel}</h2>
        {(saving || isPending) && <Loader2 size={15} className="animate-spin text-gray-400" />}

        <div className="ml-auto flex items-center gap-2">
          {users.length > 1 && (
            <select
              value={team}
              onChange={(e) => go({ team: e.target.value })}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All team members</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex overflow-hidden rounded border border-gray-300 bg-white">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => go({ view: v })}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  view === v ? "bg-green-500 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Calendar + drawer */}
      <div className="flex items-start gap-4">
        <div className={`min-w-0 flex-1 ${isPending ? "opacity-60" : ""}`}>
          {view === "month" ? renderMonth() : renderTimeGrid()}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(dotTone).map(([s, c]) => (
              <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className={`h-2.5 w-2.5 rounded ${c}`} />
                {s === "ACTIVE" ? "Active" : s === "REQUIRES_INVOICING" ? "Requires Invoicing" : "Archived"}
              </div>
            ))}
          </div>
        </div>

        {/* Unscheduled drawer */}
        {drawerOpen && (
          <aside className="sticky top-4 w-72 shrink-0 rounded-lg border border-gray-200 bg-white max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-80 max-lg:max-w-[85vw] max-lg:overflow-y-auto max-lg:rounded-none max-lg:border-l max-lg:shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Unscheduled jobs{unscheduled.length > 0 && ` (${unscheduled.length})`}
              </h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            </div>
            {unscheduled.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                Nothing waiting to be scheduled. New jobs without a date will show up here.
              </p>
            ) : (
              <>
                <p className="px-4 pt-3 text-xs text-gray-400 max-lg:hidden">
                  Drag a job onto the calendar to schedule it.
                </p>
                <ul className="space-y-2 p-3">
                  {unscheduled.map((job) => (
                    <li
                      key={job.id}
                      {...dragProps(job)}
                      onClick={() => openJob(job.id)}
                      className={`flex cursor-pointer items-start gap-2 rounded border border-gray-200 bg-white p-2.5 transition-colors hover:border-green-300 hover:bg-green-50/50 ${
                        dragId === job.id ? "opacity-50" : ""
                      }`}
                    >
                      <GripVertical size={14} className="mt-0.5 shrink-0 text-gray-300" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{job.title}</p>
                        <p className="truncate text-xs text-gray-500">
                          {job.contactName} · Job #{job.jobNumber}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
        {drawerOpen && (
          <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setDrawerOpen(false)} />
        )}
      </div>
    </div>
  );
}
