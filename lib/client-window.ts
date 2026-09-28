/**
 * A job's CLIENT window — when the customer can take the visit: "not before
 * 1 PM", "before noon", "between 8 and 10". Stored as minutes from midnight
 * in the company's timezone (Job.arriveAfterMin / arriveBeforeMin) so it
 * survives moving the visit to another day. The route optimizer waits for
 * the start and warns when an order would arrive after the end
 * (lib/route-walk.ts); the routes page shows it as a chip.
 *
 * Not the arrival window (lib/arrival-window.ts): that one is the promise
 * made to the client once a time is set ("we'll be there 1–3"). Pure.
 */

export type ClientWindow = { arriveAfterMin: number | null; arriveBeforeMin: number | null };

const MAX_MIN = 24 * 60;

function minuteOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_MIN ? n : undefined;
}

/**
 * The Prisma patch for a request body that may carry `arriveAfterMin` /
 * `arriveBeforeMin` (minutes, or "HH:mm" strings). Fields the body doesn't
 * mention are left alone; an unusable value is ignored; a window that ends
 * before it starts is dropped (the client would have promised nothing).
 */
export function clientWindowPatch(body: Record<string, unknown>): Partial<ClientWindow> {
  const after = minuteOrNull(typeof body.arriveAfterMin === "string" ? timeToMinute(body.arriveAfterMin) : body.arriveAfterMin);
  const before = minuteOrNull(typeof body.arriveBeforeMin === "string" ? timeToMinute(body.arriveBeforeMin) : body.arriveBeforeMin);
  const out: Partial<ClientWindow> = {};
  if (after !== undefined) out.arriveAfterMin = after;
  if (before !== undefined) out.arriveBeforeMin = before;
  if (out.arriveAfterMin != null && out.arriveBeforeMin != null && out.arriveBeforeMin <= out.arriveAfterMin) {
    return {};
  }
  return out;
}

/** "13:30" → 810; anything else → the raw value (so the caller's validation rejects it). */
export function timeToMinute(v: string): number | string {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  if (!m) return v === "" ? "" : v;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 810 → "13:30" for a <input type="time">. */
export function minuteToTime(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "1:30 PM" for chips and warnings. */
export function minuteLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "after 1 PM" / "before noon" / "8 AM – 10 AM"; null when there's no window. */
export function clientWindowLabel(w: Partial<ClientWindow> | null | undefined): string | null {
  const after = w?.arriveAfterMin ?? null;
  const before = w?.arriveBeforeMin ?? null;
  if (after == null && before == null) return null;
  if (after != null && before != null) return `${minuteLabel(after)} – ${minuteLabel(before)}`;
  if (after != null) return `after ${minuteLabel(after)}`;
  return `before ${minuteLabel(before!)}`;
}
