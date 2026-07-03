/**
 * Business hours for online booking, stored as JSON on Company.businessHours:
 * { mon: [{ start: "08:00", end: "17:00" }], tue: [...], ... }
 * A missing/empty day = closed. Company.businessHours null = the company never
 * opened the editor — fall back to default weekday hours so enabling booking
 * "just works" and the editor shows something sensible to adjust.
 */

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type TimeRange = { start: string; end: string }; // "HH:MM", 24h
export type BusinessHours = Record<DayKey, TimeRange[]>;

export const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  sun: [],
  mon: [{ start: "08:00", end: "17:00" }],
  tue: [{ start: "08:00", end: "17:00" }],
  wed: [{ start: "08:00", end: "17:00" }],
  thu: [{ start: "08:00", end: "17:00" }],
  fri: [{ start: "08:00", end: "17:00" }],
  sat: [],
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" → minutes since midnight, or null if malformed. */
export function timeToMinutes(t: string): number | null {
  const m = TIME_RE.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Normalize an untrusted value (settings PATCH body or raw DB Json) into
 * well-formed hours. null/garbage → the default weekday hours. Ranges that
 * don't parse or run backwards are dropped; max 3 ranges per day.
 */
export function sanitizeBusinessHours(raw: unknown): BusinessHours {
  if (!raw || typeof raw !== "object") return DEFAULT_BUSINESS_HOURS;
  const r = raw as Record<string, unknown>;
  const out = {} as BusinessHours;
  for (const day of DAY_KEYS) {
    const ranges = Array.isArray(r[day]) ? (r[day] as unknown[]) : [];
    out[day] = ranges
      .slice(0, 3)
      .map((v) => {
        const t = (v ?? {}) as Record<string, unknown>;
        const start = typeof t.start === "string" ? t.start : "";
        const end = typeof t.end === "string" ? t.end : "";
        return { start, end };
      })
      .filter((t) => {
        const s = timeToMinutes(t.start);
        const e = timeToMinutes(t.end);
        return s !== null && e !== null && s < e;
      })
      .sort((a, b) => timeToMinutes(a.start)! - timeToMinutes(b.start)!);
  }
  return out;
}

/** ZIP list: 5-digit US ZIPs, deduped. Empty = no service-area restriction. */
export function sanitizeServiceZips(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const zips = raw
    .filter((z): z is string => typeof z === "string")
    .map((z) => z.trim())
    .filter((z) => /^\d{5}$/.test(z));
  return [...new Set(zips)].slice(0, 200);
}

/** Pull the first 5-digit ZIP out of a free-form address, if any. */
export function zipFromAddress(address: string): string | null {
  const m = /\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/.exec(address);
  return m ? m[1] : null;
}
