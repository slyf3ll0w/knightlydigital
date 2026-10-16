"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import OptionChip, { ChipRow } from "@/components/OptionChip";
import { dayChoices, otherDayLabel, type DayChoice } from "@/lib/day-chips";

/**
 * Pick a day with one tap: Today, Tomorrow, Mon 20 … plus "Pick a date" for
 * anything further out. Replaces the bare date input on the job and
 * appointment forms (streamline batch 1, 2026-10-16). Value is the local
 * "YYYY-MM-DD" the forms already use.
 *
 * The chip list is built on the client after mount (the server has no idea
 * what "today" is where the user sits), so the first paint shows only the
 * date input and the chips fill in a tick later.
 */
export default function DayChips({
  value,
  onChange,
  ariaLabel = "Day",
}: {
  value: string;
  onChange: (date: string) => void;
  ariaLabel?: string;
}) {
  const [days, setDays] = useState<DayChoice[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDays(dayChoices());
  }, []);

  const picked = value.slice(0, 10);
  const inChips = days.some((d) => d.value === picked);
  const showOther = picked && !inChips;

  function openPicker() {
    setPickerOpen(true);
    // Open the native picker in the same gesture where the browser allows it
    requestAnimationFrame(() => {
      const el = dateRef.current;
      if (!el) return;
      el.focus();
      try {
        (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      } catch {
        /* not every browser lets a script open it */
      }
    });
  }

  return (
    <div className="space-y-2">
      <ChipRow ariaLabel={ariaLabel}>
        {days.map((d) => (
          <OptionChip key={d.value} active={picked === d.value} onClick={() => onChange(d.value)}>
            {d.label}
          </OptionChip>
        ))}
        {showOther && (
          <OptionChip active onClick={openPicker}>
            {otherDayLabel(picked)}
          </OptionChip>
        )}
        <OptionChip active={false} onClick={openPicker} ariaLabel="Pick a date">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={14} aria-hidden />
            {showOther ? "Change" : "Pick a date"}
          </span>
        </OptionChip>
      </ChipRow>
      {(pickerOpen || days.length === 0) && (
        <input
          ref={dateRef}
          type="date"
          aria-label={`${ariaLabel} date`}
          value={picked}
          onChange={(e) => {
            onChange(e.target.value);
            if (e.target.value) setPickerOpen(false);
          }}
          className="w-full sm:w-56 rounded-[12px] border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
        />
      )}
    </div>
  );
}
