"use client";

import { useMemo } from "react";
import { slotTimeOptions, splitLocalDateTime, joinLocalDateTime, formatSlotLabel } from "@/lib/scheduling";
import { DateField } from "@/components/DateField";

/**
 * The even-time dropdown on its own (:00/:30/… at the company's interval),
 * for forms that pick the day some other way — the day chips on New Job /
 * New Appointment (streamline batch 1, 2026-10-16). An existing odd-minute
 * time (legacy data) stays selectable as its own "(current)" option so an
 * edit never silently moves it.
 */
export function SlotTimeSelect({
  time,
  onChange,
  intervalMinutes,
  dayStartMinutes,
  className,
  ariaLabel = "Time",
  disabled = false,
}: {
  time: string;
  onChange: (time: string) => void;
  intervalMinutes: number;
  dayStartMinutes?: number;
  className: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const options = useMemo(() => {
    const base = slotTimeOptions(intervalMinutes, dayStartMinutes);
    if (time && !base.some((o) => o.value === time)) {
      return [{ value: time, label: `${formatSlotLabel(time)} (current)` }, ...base];
    }
    return base;
  }, [intervalMinutes, dayStartMinutes, time]);

  return (
    <select
      value={time}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      disabled={disabled}
    >
      <option value="">Time…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Date field + even-time dropdown, replacing a free-form datetime-local so staff
 * pick clean slots (:00/:30/…) instead of fiddling odd minutes. The value stays
 * a `YYYY-MM-DDTHH:mm` local string so existing localInputToISO callers are
 * unchanged.
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

  return (
    <div className="flex gap-2">
      <DateField
        value={date}
        aria-label={ariaLabel ? `${ariaLabel} date` : "Date"}
        onChange={(e) => onChange(joinLocalDateTime(e.target.value, time))}
        className={inputCls}
      />
      <SlotTimeSelect
        time={time}
        onChange={(t) => onChange(joinLocalDateTime(date, t))}
        intervalMinutes={intervalMinutes}
        dayStartMinutes={dayStartMinutes}
        className={timeCls ?? inputCls}
        ariaLabel={ariaLabel ? `${ariaLabel} time` : "Time"}
        disabled={!date}
      />
    </div>
  );
}
