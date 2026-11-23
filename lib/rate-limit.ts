/**
 * Fixed-window rate limiter.
 *
 * Store: Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + _TOKEN are set —
 * counters are then shared across every container, so login brute-force and
 * spend caps hold even with replicas. Without those vars it falls back to a
 * process-local Map, which is exactly right for one container and silently
 * halves every limit for each extra one.
 *
 * Edge-safe: fetch + Maps only, no Node APIs, so the middleware can use it.
 * A Redis outage degrades to the in-memory store rather than failing open.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Opportunistic cleanup so the map doesn't grow unbounded under churn
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function memoryLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, remaining: max - bucket.count, retryAfterSeconds: 0 };
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${REDIS_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    // A slow limiter must never become the slow part of a request
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return res.json();
}

async function redisLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  const [incr, pttl] = (await redis("/pipeline", [["INCR", k], ["PTTL", k]])) as {
    result: number;
  }[];
  const count = incr.result;
  let ttlMs = pttl.result;
  // First hit in a window (or a key that somehow lost its expiry): arm it
  if (count === 1 || ttlMs < 0) {
    await redis(`/pexpire/${encodeURIComponent(k)}/${windowMs}`);
    ttlMs = windowMs;
  }
  if (count > max) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
  }
  return { ok: true, remaining: max - count, retryAfterSeconds: 0 };
}

/**
 * Count a hit against `key` and report whether it's within `max` per `windowMs`.
 */
export async function limit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      return await redisLimit(key, max, windowMs);
    } catch (err) {
      console.error("[rate-limit] redis unavailable, using in-memory store:", err);
    }
  }
  return memoryLimit(key, max, windowMs);
}

/**
 * Client IP from proxy headers. The site sits behind Cloudflare → Railway, so
 * x-forwarded-for starts with a rotating Cloudflare edge IP — useless as a
 * rate-limit key. cf-connecting-ip / x-real-ip carry the real client.
 */
/** Did this request provably pass through Cloudflare? See clientIp. */
export function cameThroughEdge(headers: Headers): boolean {
  const secret = process.env.EDGE_SHARED_SECRET?.trim();
  if (!secret) return true;
  if (secret.toLowerCase() === "off") return false;
  const sent = headers.get("x-wb-edge") ?? "";
  if (sent.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export function clientIp(headers: Headers): string {
  // Cloudflare overwrites this header on every proxied request, so behind it
  // the value is the visitor's, whatever they typed. Off Cloudflare (staging)
  // the hosting proxy APPENDS to x-forwarded-for: the LAST entry is what the
  // proxy itself saw, the first is whatever the caller sent. The middleware
  // sends every request for a non-canonical hostname away first
  // (lib/canonical-host.ts), so a caller can't reach this off-Cloudflare in
  // production and hand-pick their bucket.
  //
  // "Can't reach this off-Cloudflare" rests on the Host header alone, which a
  // caller who finds the hosting address can type. EDGE_SHARED_SECRET closes
  // that (2026-11-23 security review): Cloudflare adds the header x-wb-edge
  // with that value to every request it forwards (a Transform Rule), and
  // cf-connecting-ip is believed only when it is there. A request that came
  // straight to the host has no such header, so it is keyed on the address
  // the hosting proxy itself saw. "off" = never believe cf-connecting-ip
  // (staging, which has no Cloudflare). Unset = as before.
  const cf = cameThroughEdge(headers) ? headers.get("cf-connecting-ip") : null;
  if (cf) return cf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
