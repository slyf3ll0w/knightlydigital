"use client";

import OptionChip, { ChipRow } from "@/components/OptionChip";

/**
 * How long: 30 min / 1 hr / 1½ hrs / 2 hrs / Half day / All day, or Custom
 * (the parent then shows an End time). Replaces picking an end time by hand
 * on the job and appointment forms. `null` = custom.
 */
export const DURATION_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hr" },
  { minutes: 90, label: "1½ hrs" },
  { minutes: 120, label: "2 hrs" },
  { minutes: 240, label: "Half day" },
  { minutes: 480, label: "All day" },
];

/** The chip for a length, when one matches exactly (a suggested slot, an edit). */
export function durationChoiceFor(minutes: number): number | null {
  return DURATION_CHOICES.some((c) => c.minutes === minutes) ? minutes : null;
}

export default function DurationChips({
  value,
  onChange,
  ariaLabel = "How long",
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  ariaLabel?: string;
}) {
  return (
    <ChipRow ariaLabel={ariaLabel}>
      {DURATION_CHOICES.map((c) => (
        <OptionChip key={c.minutes} active={value === c.minutes} onClick={() => onChange(c.minutes)}>
          {c.label}
        </OptionChip>
      ))}
      <OptionChip active={value === null} onClick={() => onChange(null)}>
        Custom
      </OptionChip>
    </ChipRow>
  );
}
