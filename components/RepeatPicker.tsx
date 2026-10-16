"use client";

import { inputCls } from "@/components/Input";
import { DAY_SHORT } from "@/lib/time-block-recurrence";
import { DateField } from "@/components/DateField";

/**
 * The weekly repeat control shared by the Schedule's block sheet and the
 * repeating-block editor in Settings: seven day chips (0 = Sunday) and an
 * optional "until" date. The company's primary color fills a picked day.
 */
export default function RepeatPicker({
  weekdays,
  onWeekdays,
  endsOn,
  onEndsOn,
  startsOn,
  disabled = false,
}: {
  weekdays: number[];
  onWeekdays: (next: number[]) => void;
  endsOn: string;
  onEndsOn: (next: string) => void;
  /** The earliest "until" the date input accepts */
  startsOn?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
        {DAY_SHORT.map((label, i) => {
          const on = weekdays.includes(i);
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onWeekdays(on ? weekdays.filter((d) => d !== i) : [...weekdays, i].sort((a, b) => a - b))}
              className={`h-9 min-w-[42px] flex-1 rounded-full border px-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:flex-none ${
                on ? "border-transparent text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
              }`}
              style={on ? { backgroundColor: "var(--ds-primary)" } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <label htmlFor="repeat-until" className="text-xs font-medium text-gray-500">
          Until
        </label>
        <div className="flex items-center gap-2">
          <DateField
            id="repeat-until"
            value={endsOn}
            min={startsOn || undefined}
            disabled={disabled}
            onChange={(e) => onEndsOn(e.target.value)}
            className={`${inputCls} max-w-[180px]`}
            aria-label="Repeats until (optional)"
          />
          {endsOn ? (
            <button type="button" disabled={disabled} onClick={() => onEndsOn("")} className="text-xs font-medium text-gray-500 hover:text-gray-800">
              No end
            </button>
          ) : (
            <span className="text-xs text-gray-400">No end</span>
          )}
        </div>
      </div>
    </div>
  );
}
