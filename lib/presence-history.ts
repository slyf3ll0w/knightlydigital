import { prisma } from "@/lib/db";

/**
 * The console's "People online" graph (David 2026-10-02). Reads the
 * PresenceSample rows the presence heartbeat writes (one per person per
 * 5-minute slot with the app in front of them) and counts distinct people
 * per bucket, with and without test accounts.
 *
 * Three views, all precomputed so the page can flip between them without a
 * round trip: the last 24 hours in 15-minute buckets, the last 7 days by
 * hour, the last 30 days by day (a day = the console's day, Central time).
 * Buckets before the first sample ever recorded are null — no history yet,
 * which is not the same as nobody online.
 */

export type OnlinePoint = { t: number; all: number | null; live: number | null };
export type OnlineSeries = { key: "day" | "week" | "month"; bucketMs: number; points: OnlinePoint[] };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Day boundaries for the 30-day view. */
const CONSOLE_TZ = "America/Chicago";

const VIEWS: { key: OnlineSeries["key"]; span: number; bucket: number }[] = [
  { key: "day", span: DAY, bucket: 15 * MIN },
  { key: "week", span: 7 * DAY, bucket: HOUR },
  { key: "month", span: 30 * DAY, bucket: DAY },
];

/** The zone's offset from UTC in ms at `at` (Central = -5 h or -6 h). */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return asUtc - Math.floor(at.getTime() / MIN) * MIN;
}

/** Floor `ms` to its bucket; whole-day buckets break at the console's midnight. */
function bucketStart(ms: number, bucket: number, offset: number): number {
  return Math.floor((ms + offset) / bucket) * bucket - offset;
}

/** Distinct people per bucket since `startAt`, counted in Postgres. */
async function countBuckets(startAt: number, bucket: number, off: number) {
  // bucket start (ms) = floor((epoch_ms + off) / bucket) * bucket - off
  const rows = await prisma.$queryRaw<{ b: number; all: bigint; live: bigint }[]>`
    SELECT (floor((extract(epoch FROM s."at") * 1000 + ${off}::float8) / ${bucket}::float8) * ${bucket}::float8 - ${off}::float8)::float8 AS b,
           count(DISTINCT s."userId") AS "all",
           count(DISTINCT s."userId") FILTER (WHERE c."isTest" IS NOT TRUE) AS live
    FROM "PresenceSample" s
    LEFT JOIN "Company" c ON c.id = s."companyId"
    WHERE s."at" >= ${new Date(startAt)}
    GROUP BY 1
  `;
  return new Map(rows.map((r) => [Math.round(Number(r.b)), { all: Number(r.all), live: Number(r.live) }]));
}

export async function loadOnlineHistory(now: Date = new Date()): Promise<OnlineSeries[]> {
  const offset = tzOffsetMs(CONSOLE_TZ, now);
  const first = await prisma.presenceSample.findFirst({ orderBy: { at: "asc" }, select: { at: true } });
  const firstAt = first ? first.at.getTime() : null;

  return Promise.all(
    VIEWS.map(async ({ key, span, bucket }) => {
      const off = bucket === DAY ? offset : 0;
      const last = bucketStart(now.getTime(), bucket, off);
      const count = Math.round(span / bucket);
      const startAt = last - (count - 1) * bucket;
      const counts = firstAt === null ? new Map() : await countBuckets(startAt, bucket, off);
      const points: OnlinePoint[] = [];
      for (let i = 0; i < count; i++) {
        const t = startAt + i * bucket;
        // No history before the first sample ever: a gap, not a zero.
        const known = firstAt !== null && t + bucket > firstAt;
        const c = counts.get(t);
        points.push({ t, all: known ? (c?.all ?? 0) : null, live: known ? (c?.live ?? 0) : null });
      }
      return { key, bucketMs: bucket, points };
    })
  );
}
