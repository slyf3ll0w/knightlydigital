/**
 * Shared "was that a hiccup or a verdict?" test for the outbound HTTP clients
 * (Telnyx in lib/telnyx.ts, Google in lib/google-calendar.ts).
 *
 * A transient failure says nothing about the request: a dropped socket, a
 * DNS blip, an AbortSignal timeout, or the provider's own 5xx / 429. Every
 * hourly and five-minute sweep retries on its own, so the first miss is a
 * warning in the logs, not a Sentry page — Sentry d8c03bcb (2026-10-13) was
 * one Telnyx 503 paging twice at once, for both live lines, and the next
 * hour's sweep was fine.
 */

const TRANSIENT_NET_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** A network-level failure from `fetch`, before the provider ever answered. */
export function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) return true;
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && TRANSIENT_NET_CODES.has(code);
}

/** An HTTP status that means "try again", not "you are wrong". */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// ── consecutive-miss counter ─────────────────────────────────────────────
//
// A sweep that treats every transient miss as a warning would never page on
// a provider that has been down all day. This counts misses per key between
// successes so the Nth hour in a row reaches Sentry. In-process on purpose:
// the app is one long-lived container and a redeploy resetting the count only
// delays a page by an hour, which is not worth a column.

const misses = new Map<string, number>();

/**
 * Record one transient miss for `key`. Returns true once `key` has missed
 * `limit` times in a row — the caller reports then and stays quiet before.
 */
export function transientMissSustained(key: string, limit: number): boolean {
  const n = (misses.get(key) ?? 0) + 1;
  misses.set(key, n);
  return n >= limit;
}

/** A success for `key`: the next miss starts counting from one again. */
export function clearTransientMiss(key: string): void {
  misses.delete(key);
}

/** Test hook: how many misses in a row `key` currently has. */
export function transientMissCount(key: string): number {
  return misses.get(key) ?? 0;
}
