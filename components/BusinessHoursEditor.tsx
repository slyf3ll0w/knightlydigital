"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  DAY_KEYS,
  DAY_LABELS,
  type BusinessHours,
  type DayKey,
  type TimeRange,
} from "@/lib/business-hours";

/**
 * The weekly hours grid — one row per day, open/closed checkbox, up to two
 * ranges ("split the day"). Shared by company business hours (Settings →
 * Booking) and per-member working hours (Team page); all sanitizing happens
 * server-side (lib/business-hours.ts), this just edits the shape.
 */

const inputCls =
  "px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
// Time fields split the row evenly on phones (16px text makes a fixed-width
// <input type="time"> wider than half a 375px card) and size to content on
// desktop. Padding is trimmed under lg because "08:00 AM" plus the clock glyph
// needs every pixel once a split range adds a remove button to the row.
const timeCls = `${inputCls} min-w-0 flex-1 px-1.5 lg:flex-none lg:px-2`;

export default function BusinessHoursEditor({
  hours,
  onChange,
}: {
  hours: BusinessHours;
  onChange: (next: BusinessHours) => void;
}) {
  function setDay(day: DayKey, ranges: TimeRange[]) {
    onChange({ ...hours, [day]: ranges });
  }

  return (
    /* One card per day on phones — the day toggle on its own line with the
       time fields beneath it. Side by side, a 28-unit label plus two 16px
       time inputs overflowed a 375px card and wrapped mid-range. Desktop
       keeps the single compact row. */
    <div className="space-y-2 lg:space-y-1.5">
      {DAY_KEYS.map((day) => {
        const ranges = hours[day];
        const isOpen = ranges.length > 0;
        return (
          <div
            key={day}
            className="rounded-xl border border-gray-100 p-2.5 lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:p-0"
          >
            <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-gray-700 lg:w-28 lg:justify-start">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isOpen}
                  onChange={(e) =>
                    setDay(day, e.target.checked ? [{ start: "08:00", end: "17:00" }] : [])
                  }
                  className="h-4 w-4 accent-green-600"
                />
                <span className="font-medium lg:font-normal">{DAY_LABELS[day]}</span>
              </span>
              {!isOpen && <span className="text-xs text-gray-400">Closed</span>}
            </label>
            {isOpen && (
              <div className="mt-2.5 space-y-2 lg:mt-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:space-y-0">
                {ranges.map((r, i) => (
                  <span key={i} className="flex items-center gap-1 lg:gap-1.5">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) =>
                        setDay(
                          day,
                          ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x))
                        )
                      }
                      className={timeCls}
                    />
                    <span className="shrink-0 text-xs text-gray-400">to</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) =>
                        setDay(
                          day,
                          ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x))
                        )
                      }
                      className={timeCls}
                    />
                    {ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                        className="shrink-0 p-0 text-gray-300 hover:text-red-500 lg:p-1"
                        aria-label="Remove hours"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                ))}
                {ranges.length < 2 && (
                  <button
                    type="button"
                    onClick={() => setDay(day, [...ranges, { start: "13:00", end: "17:00" }])}
                    className="flex items-center gap-0.5 text-xs font-medium text-gray-400 hover:text-green-600"
                    title="Split the day, e.g. around lunch"
                  >
                    <Plus size={12} />
                    Split the day
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
