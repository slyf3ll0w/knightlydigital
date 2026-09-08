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
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
