/**
 * Display formatters shared by every surface — one way to write a date, a
 * time, and a phone number. Money already lives in lib/statuses.ts
 * (`money()`); this file holds the rest so the fourteen inline
 * `toLocaleDateString` recipes and the raw `2145550196` phone strings the
 * UX audit found have one place to agree.
 *
 * Every function takes an optional IANA zone: the server runs on UTC, so a
 * date shown to a company must be read in the company's zone or it flips
 * to the wrong day every evening (see lib/timezone.ts).
 */

/** "Sep 18, 2026" */
export function fmtDate(d: Date | string | number, tz?: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** "Sep 18" — same day, no year (lists, timelines) */
export function fmtDayShort(d: Date | string | number, tz?: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** "Thursday, September 18" — the greeting / hero date */
export function fmtDayLong(d: Date | string | number, tz?: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** "2:30 PM" */
export function fmtTime(d: Date | string | number, tz?: string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** "Sep 18, 2:30 PM" */
export function fmtDateTime(d: Date | string | number, tz?: string): string {
  return `${fmtDayShort(d, tz)}, ${fmtTime(d, tz)}`;
}

/**
 * "(214) 555-0196" for a 10-digit US number, "+1 (214) 555-0196" with a
 * leading 1, and the input untouched for anything else (extensions,
 * international, or a partial typed value) so nothing is ever hidden.
 */
export function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return s;
}
