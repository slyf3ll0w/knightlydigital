"use client";

import { useMemo } from "react";
import { slotTimeOptions, splitLocalDateTime, joinLocalDateTime, formatSlotLabel } from "@/lib/scheduling";

/**
 * Date field + even-time dropdown, replacing a free-form datetime-local so staff
 * pick clean slots (:00/:30/…) instead of fiddling odd minutes. The value stays
 * a `YYYY-MM-DDTHH:mm` local string so existing localInputToISO callers are
 * unchanged. An existing odd-minute time (legacy data) is preserved as its own
 * "(current)" option so editing a record never silently moves its time.
 */
export default function SlotTimePicker({
  value,
  onChange,
  intervalMinutes,
  dayStartMinutes,
  inputCls,
  timeCls,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  intervalMinutes: number;
  /** Business-day anchor (minutes since midnight) — the option list opens
      here and wraps, so operating hours come before the small hours. */
  dayStartMinutes?: number;
  inputCls: string;
  timeCls?: string;
  ariaLabel?: string;
}) {
  const { date, time } = splitLocalDateTime(value);

  const options = useMemo(() => {
    const base = slotTimeOptions(intervalMinutes, dayStartMinutes);
    // Keep an off-grid existing time selectable so we never lose it on edit.
    if (time && !base.some((o) => o.value === time)) {
      return [{ value: time, label: `${formatSlotLabel(time)} (current)` }, ...base];
    }
    return base;
  }, [intervalMinutes, dayStartMinutes, time]);

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={date}
        aria-label={ariaLabel ? `${ariaLabel} date` : "Date"}
        onChange={(e) => onChange(joinLocalDateTime(e.target.value, time))}
        className={inputCls}
      />
      <select
        value={time}
        aria-label={ariaLabel ? `${ariaLabel} time` : "Time"}
        onChange={(e) => onChange(joinLocalDateTime(date, e.target.value))}
        className={timeCls ?? inputCls}
        disabled={!date}
      >
        <option value="">Time…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
