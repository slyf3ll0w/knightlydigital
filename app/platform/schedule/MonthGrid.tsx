"use client";

import { AlertTriangle as AlertTriangleIcon, UserX as UserXIcon } from "lucide-react";
import {
  DAY_NAMES,
  durationLabel,
  fmtTime,
  itemDuration,
  itemTone,
  sameDay,
  sortItems,
  toParam,
  type ScheduleJobDTO,
} from "./schedule-lib";
import { TypeGlyph } from "./TypeGlyph";
import type { useCalendarDrag } from "./useCalendarDrag";

/**
 * Desktop month grid. Every cell is a `data-drop="day"` zone — dropping a
 * scheduled item keeps its time of day and only moves the date. Chips sort
 * Anytime-first then by clock (the old grid listed them in the order the
 * server happened to return them: jobs, then appointments, then blocks).
 *
 * Under the day number a thin capacity bar shows how full the day is
 * against the crew's open hours, so a dispatcher can see which days have
 * room before dropping anything.
 */
export default function MonthGrid({
  anchor,
  today,
  items,
  drag,
  onOpen,
  onGoDay,
  capacityByDow,
  onCellClick,
}: {
  anchor: Date;
  today: Date;
  items: ScheduleJobDTO[];
  drag: ReturnType<typeof useCalendarDrag>;
  onOpen: (item: ScheduleJobDTO) => void;
  onGoDay: (date: Date) => void;
  /** Minutes of crew time available per weekday (index = getDay()); 0 = closed. */
  capacityByDow: number[];
  /** A click on a cell's empty space (armed palette card → place it here). */
  onCellClick?: (date: Date) => void;
}) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const byDay: Record<number, ScheduleJobDTO[]> = {};
  for (const it of items) {
    if (!it.scheduledAt) continue;
    const d = new Date(it.scheduledAt);
    if (d.getMonth() !== m || d.getFullYear() !== y) continue;
    (byDay[d.getDate()] ??= []).push(it);
  }

  const dragging = drag.state;
  const targetDay =
    dragging?.target?.type === "day" ? dragging.target.date : null;
  const movingId = dragging?.source.type === "item" ? dragging.source.item.id : null;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(
      <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50 p-1 lg:min-h-[104px]" />
    );
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(y, m, d);
    const isToday = sameDay(cellDate, today);
    const dayItems = sortItems(byDay[d] ?? []);
    const hot = targetDay ? sameDay(targetDay, cellDate) : false;

    // Booked minutes = timed work (blocks are unavailability, not load)
    const booked = dayItems
      .filter((it) => it.kind !== "block" && !it.scheduledAnytime)
      .reduce((s, it) => s + itemDuration(it), 0);
    const cap = capacityByDow[cellDate.getDay()] ?? 0;
    const fill = cap > 0 ? Math.min(1, booked / cap) : 0;
    const loadTone = fill >= 0.95 ? "bg-[color:var(--ds-bad)]" : fill >= 0.7 ? "bg-[color:var(--ds-warn)]" : "bg-[color:var(--ds-good)]";

    cells.push(
      <div
        key={d}
        data-drop="day"
        data-date={toParam(cellDate)}
        onClick={(e) => {
          if (!onCellClick) return;
          if ((e.target as HTMLElement).closest("[data-item],button")) return;
          onCellClick(cellDate);
        }}
        className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 transition-colors lg:min-h-[104px] ${
          onCellClick ? "cursor-pointer" : ""
        } ${
          hot ? "bg-[color:var(--ds-primary-soft)] ring-2 ring-inset ring-[color:var(--ds-primary)]" : isToday ? "bg-[color-mix(in_srgb,var(--ds-primary)_5%,transparent)]" : ""
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5">
          <button
            onClick={() => onGoDay(cellDate)}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              isToday ? "bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {d}
          </button>
          {cap > 0 && booked > 0 && (
            <span
              className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"
              title={`${durationLabel(booked)} booked of ${durationLabel(cap)} available`}
              aria-label={`${durationLabel(booked)} booked of ${durationLabel(cap)}`}
            >
              <span className={`h-full rounded-full ${loadTone}`} style={{ width: `${Math.max(6, fill * 100)}%` }} />
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          {dayItems.slice(0, 3).map((it) => (
            <div
              key={it.id}
              data-item
              {...(it.kind === "block" && !it.block?.canEdit
                ? {}
                : drag.handleProps({ type: "item", item: it, mode: "move", grabOffsetMin: 0 }))}
              onClick={() => onOpen(it)}
              className={`flex cursor-grab select-none items-center gap-1 truncate rounded-lg border-l-2 px-1.5 py-0.5 text-xs font-medium active:cursor-grabbing ${itemTone(it)} ${
                movingId === it.id ? "opacity-40" : ""
              }`}
              title={`${it.contactName} — ${it.title}${it.conflictNote ? `\n⚠ Overlaps: ${it.conflictNote}` : ""}${it.needsCrew ? "\n⚠ Nobody assigned" : ""}`}
            >
              <TypeGlyph apptType={it.apptType} recurring={it.recurring} />
              {it.conflictNote && <AlertTriangleIcon size={11} className="shrink-0 text-[color:var(--ds-warn)]" />}
              {it.needsCrew && <UserXIcon size={11} className="shrink-0 text-[color:var(--ds-warn)]" aria-label="Nobody assigned" />}
              <span className="truncate">
                {it.scheduledAnytime ? "" : `${fmtTime(new Date(it.scheduledAt!))} `}
                {it.kind === "block" ? it.title || "Blocked off" : `${it.contactName} — ${it.title}`}
              </span>
            </div>
          ))}
          {dayItems.length > 3 && (
            <button
              onClick={() => onGoDay(cellDate)}
              className="pl-1 text-xs text-gray-500 hover:text-gray-600 hover:underline"
            >
              +{dayItems.length - 3} more
            </button>
          )}
        </div>
      </div>
    );
  }
  const total = firstDow + daysInMonth;
  if (total % 7 > 0) {
    for (let i = 0; i < 7 - (total % 7); i++) {
      cells.push(
        <div key={`t-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50 p-1 lg:min-h-[104px]" />
      );
    }
  }

  return (
    <div className="ds-card overflow-hidden">
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
