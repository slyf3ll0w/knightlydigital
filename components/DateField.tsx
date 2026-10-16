"use client";

import { dateLabel, dateTimeLabel, timeLabel } from "@/lib/date-label";

/**
 * The phone's own date / time / date-time boxes, made readable (David
 * 2026-10-16: "some of the date pickers are not formatted right").
 *
 * On a phone, mobile WebKit draws these controls with its own text
 * ("10/20/2026", nothing at all when empty, a collapsed box) that ignores
 * most styling. So on phones the control's text is hidden (`.wb-pick`,
 * globals.css) and a label sits over it reading "Mon, Oct 20", "2:30 PM"
 * or the placeholder — the control itself is still what gets tapped, so
 * the native calendar / time wheel opens exactly as before. Desktop (lg+)
 * renders the plain input.
 *
 * Drop-in for `<input type="date|time|datetime-local">`: every prop passes
 * through, `className` is split — sizing and spacing classes go to the
 * wrapper, the rest to the input.
 */
type FieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Phone label when the box is empty. */
  placeholder?: string;
};

const OUTER = /^(?:(?:sm|md|lg|xl):)?(?:w-|max-w-|min-w-|flex|basis-|grow|shrink|m[tblrxy]?-|-m[tblrxy]?-|absolute|relative|inset|hidden|block|inline)/;
const TEXT = /^text-(?:xs|sm|base|lg|\[\d+px\])$/;
const PAD = /^(?:px|pl|pr)-/;

function splitClasses(className: string): { outer: string; inner: string; label: string } {
  const outer: string[] = [];
  const inner: string[] = [];
  let text = "text-sm";
  let pad = "px-3";
  for (const t of className.split(/\s+/).filter(Boolean)) {
    if (OUTER.test(t)) outer.push(t);
    else {
      inner.push(t);
      if (TEXT.test(t)) text = t;
      else if (PAD.test(t)) pad = t.startsWith("px-") ? t : pad;
    }
  }
  return { outer: outer.join(" "), inner: inner.join(" "), label: `${text} ${pad}` };
}

function Field({
  type,
  text,
  placeholder,
  className = "",
  value,
  ...rest
}: FieldProps & { type: "date" | "time" | "datetime-local"; text: string }) {
  const { outer, inner, label } = splitClasses(className);
  const empty = !text;
  return (
    <span className={`relative inline-block align-top ${outer || "w-full"}`}>
      <input type={type} value={value} {...rest} className={`wb-pick w-full ${inner}`} />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center truncate lg:hidden ${label} ${
          rest.disabled ? "text-gray-500" : empty ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {text || placeholder}
      </span>
    </span>
  );
}

export function DateField({ placeholder = "Pick a date", ...props }: FieldProps) {
  return <Field type="date" text={dateLabel(typeof props.value === "string" ? props.value : "")} placeholder={placeholder} {...props} />;
}

export function TimeField({ placeholder = "Pick a time", ...props }: FieldProps) {
  return <Field type="time" text={timeLabel(typeof props.value === "string" ? props.value : "")} placeholder={placeholder} {...props} />;
}

export function DateTimeField({ placeholder = "Pick a date and time", ...props }: FieldProps) {
  return (
    <Field
      type="datetime-local"
      text={dateTimeLabel(typeof props.value === "string" ? props.value : "")}
      placeholder={placeholder}
      {...props}
    />
  );
}
