"use client";

import { INDUSTRIES } from "@/lib/pricebooks";

/**
 * The industry question every signup door asks. A select, not a free-text
 * field: the answer seeds the starter price book by exact key
 * (lib/pricebooks.ts), and "hvac" / "lawn care" typed by hand seeded nothing
 * for weeks while the dashboard said the price book was ready (audit
 * 2026-10-12). "Other" opens a short text field; the stored value is then
 * "Other: <what they typed>" (see industryValue) and no services are seeded —
 * the Get started checklist asks them to add their own.
 */
export function industryValue(industry: string, other: string): string {
  if (industry !== "Other") return industry;
  const o = other.trim().slice(0, 70);
  return o ? `Other: ${o}` : "Other";
}

export default function IndustrySelect({
  value,
  other,
  onChange,
  onOtherChange,
  required = true,
  inputClass,
  labelClass,
  label = "What kind of work do you do?",
  hint = "We'll pre-load your price book with services for your industry — you can edit everything later.",
}: {
  value: string;
  other: string;
  onChange: (v: string) => void;
  onOtherChange: (v: string) => void;
  required?: boolean;
  inputClass: string;
  labelClass: string;
  label?: string;
  hint?: string | null;
}) {
  return (
    <>
      <div>
        <label htmlFor="signup-industry" className={labelClass}>
          {label}
        </label>
        <select
          id="signup-industry"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={`${inputClass} bg-white`}
        >
          <option value="" disabled>
            Choose your industry…
          </option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {value === "Other" && (
        <div>
          <label htmlFor="signup-industry-other" className={labelClass}>
            What&apos;s your industry?{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="signup-industry-other"
            type="text"
            value={other}
            onChange={(e) => onOtherChange(e.target.value)}
            maxLength={70}
            className={inputClass}
            placeholder="e.g. Mobile detailing"
          />
        </div>
      )}
    </>
  );
}
