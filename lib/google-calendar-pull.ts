/**
 * Google Calendar → Workbench (the "two-way" half of calendar sync; design
 * in docs/plans/google-calendar-sync-2026-09-11.md §Two-way).
 *
 * What comes in: every BUSY event on the connected account's primary
 * calendar — a real appointment, a dentist visit, a vacation marked busy —
 * becomes a personal TimeBlock with `source: GOOGLE` on that user. Because
 * it's an ordinary TimeBlock, everything that already respects blocked time
 * respects it for free: the schedule grid, online-booking availability,
 * Find a Time, conflict badges, and the route engine. The blocks are
 * read-only in the app (the edit route refuses them) and the push side
 * (lib/google-calendar.ts) never sends them back out, so nothing loops.
 *
 * What stays out: events Workbench itself pushed (private property `wb`),
 * anything marked Free (Google's default for all-day events), cancelled
 * events, invitations the user declined, and anything outside the window.
 *
 * How it stays fresh: Google's incremental sync — the first pull reads the
 * window and stores `nextSyncToken`; later pulls send that token and get
 * only what changed (a near-free call when nothing did). A 410 means the
 * token expired → one full re-read. Runs every 5 minutes from
 * instrumentation.ts, hourly from the cron, on connect, and on "Sync now".
 */

import { prisma } from "@/lib/db";
import type { GoogleCalendarConnection } from "@prisma/client";
import {
  GoogleApiError,
  accessTokenFor,
  calPath,
  googleFetch,
  isGoogleCalendarConfigured,
  recordError,
} from "@/lib/google-calendar";
import { addDaysToKey } from "@/lib/calendar-event-shape";
import { wallTimeToUtc } from "@/lib/booking-engine";

const DAY = 86_400_000;
/** How far the mirror reaches. Past days keep "what was I doing" context. */
export const PULL_PAST_DAYS = 7;
export const PULL_FUTURE_DAYS = 180;
/** Label a mirrored block carries unless the user shares event names. */
export const PRIVATE_TITLE = "Busy";

// ─── Pure: what one Google event means for the schedule ──────────────────────

export type GoogleEventItem = {
  id: string;
  status?: string;
  summary?: string;
  transparency?: "opaque" | "transparent";
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

export type BusySpan = {
  externalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
};

/**
 * Null = not busy time for this user (cancelled, free, ours, declined,
 * outside the window, or unparseable) → any mirrored block should go.
 */
export function classifyGoogleEvent(
  item: GoogleEventItem,
  opts: { tz: string; from: Date; to: Date; shareTitles: boolean }
): BusySpan | null {
  if (!item.id) return null;
  if (item.status === "cancelled") return null;
  // Our own pushed copies of Workbench work
  if (item.extendedProperties?.private?.wb === "1") return null;
  // Google's own "shows as Free" — the default for all-day events, and how
  // people mark reminders, birthdays, working-location notes
  if (item.transparency === "transparent") return null;
  if (item.eventType === "workingLocation" || item.eventType === "birthday") return null;
  const me = item.attendees?.find((a) => a.self);
  if (me?.responseStatus === "declined") return null;

  let startAt: Date;
  let endAt: Date;
  let allDay = false;
  if (item.start?.dateTime && item.end?.dateTime) {
    startAt = new Date(item.start.dateTime);
    endAt = new Date(item.end.dateTime);
  } else if (item.start?.date && item.end?.date) {
    // All-day: Google's end date is exclusive. Store the app's convention —
    // local 00:00 on the first day through 23:59:59 on the last.
    allDay = true;
    const [sy, sm, sd] = item.start.date.split("-").map(Number);
    const lastKey = addDaysToKey(item.end.date, -1);
    const [ey, em, ed] = (lastKey < item.start.date ? item.start.date : lastKey).split("-").map(Number);
    startAt = wallTimeToUtc(opts.tz, sy, sm, sd, 0);
    endAt = new Date(wallTimeToUtc(opts.tz, ey, em, ed, 23 * 60 + 59).getTime() + 59_000);
  } else {
    return null;
  }
  if (!(startAt < endAt) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  // Outside the mirror window → not tracked (a later move into the window
  // arrives as an update)
  if (endAt < opts.from || startAt > opts.to) return null;

  const summary = (item.summary ?? "").trim();
  return {
    externalId: item.id,
    title: opts.shareTitles && summary ? summary.slice(0, 120) : PRIVATE_TITLE,
    startAt,
    endAt,
    allDay,
  };
}

// ─── Pull ────────────────────────────────────────────────────────────────────

export type PullSummary = { seen: number; upserted: number; removed: number; full: boolean; errors: number };

type ListPage = {
  items?: GoogleEventItem[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

// One pull per user at a time in this process
const inflight = new Map<string, Promise<PullSummary>>();

export async function pullUserGoogleCalendar(userId: string): Promise<PullSummary> {
  const running = inflight.get(userId);
  if (running) return running;
  const p = runPull(userId).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

async function runPull(userId: string): Promise<PullSummary> {
  const summary: PullSummary = { seen: 0, upserted: 0, removed: 0, full: false, errors: 0 };
  if (!isGoogleCalendarConfigured()) return summary;
  let connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection || !connection.syncEnabled || !connection.pullEnabled) return summary;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, companyId: true, company: { select: { timezone: true, suspendedAt: true } } },
  });
  if (!user?.isActive || !user.companyId || !user.company || user.company.suspendedAt) return summary;
  const tz = user.company.timezone;
  const companyId = user.companyId;

  let token: string;
  try {
    ({ token, connection } = await accessTokenFor(connection));
  } catch (err) {
    await recordError(connection.id, err);
    summary.errors++;
    return summary;
  }

  const now = new Date();
  const from = new Date(now.getTime() - PULL_PAST_DAYS * DAY);
  const to = new Date(now.getTime() + PULL_FUTURE_DAYS * DAY);

  try {
    let { items, nextSyncToken, full } = await listChanges(token, connection, from, to);
    if (full === "expired") {
      // Token expired at Google → start over with a window read
      ({ items, nextSyncToken, full } = await listChanges(token, { ...connection, pullSyncToken: null }, from, to));
    }
    summary.full = full === true;
    summary.seen = items.length;

    if (summary.full) {
      // A full read is authoritative for the window: anything we mirror that
      // Google no longer lists in it is gone
      const keep = new Set<string>();
      for (const item of items) {
        const span = classifyGoogleEvent(item, { tz, from, to, shareTitles: connection.shareTitles });
        if (span) {
          keep.add(span.externalId);
          await upsertBlock(userId, companyId, span);
          summary.upserted++;
        }
      }
      const stale = await prisma.timeBlock.findMany({
        where: { userId, source: "GOOGLE", externalId: { notIn: [...keep] } },
        select: { id: true },
      });
      if (stale.length > 0) {
        await prisma.timeBlock.deleteMany({ where: { id: { in: stale.map((s) => s.id) }, source: "GOOGLE" } });
        summary.removed += stale.length;
      }
    } else {
      for (const item of items) {
        const span = classifyGoogleEvent(item, { tz, from, to, shareTitles: connection.shareTitles });
        if (span) {
          await upsertBlock(userId, companyId, span);
          summary.upserted++;
        } else if (item.id) {
          const r = await prisma.timeBlock.deleteMany({ where: { userId, source: "GOOGLE", externalId: item.id } });
          summary.removed += r.count;
        }
      }
    }

    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { pullSyncToken: nextSyncToken ?? connection.pullSyncToken, lastPullAt: now, lastPullError: null },
    });
  } catch (err) {
    summary.errors++;
    const message = err instanceof Error ? err.message : "Pull failed";
    console.error("[google-calendar] pull failed", connection.id, message);
    if (err instanceof GoogleApiError && err.status === 401) {
      await recordError(connection.id, err);
    } else {
      await prisma.googleCalendarConnection
        .update({ where: { id: connection.id }, data: { lastPullError: message } })
        .catch(() => {});
    }
  }
  return summary;
}

/**
 * Incremental when we hold a sync token, otherwise the whole window.
 * `full` is "expired" when Google rejected the token (410) so the caller can
 * fall back to a window read.
 */
async function listChanges(
  token: string,
  connection: Pick<GoogleCalendarConnection, "calendarId" | "pullSyncToken">,
  from: Date,
  to: Date
): Promise<{ items: GoogleEventItem[]; nextSyncToken: string | undefined; full: boolean | "expired" }> {
  const items: GoogleEventItem[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const incremental = !!connection.pullSyncToken;
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      maxResults: "250",
      showDeleted: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    if (incremental) {
      params.set("syncToken", connection.pullSyncToken as string);
    } else {
      params.set("timeMin", from.toISOString());
      params.set("timeMax", to.toISOString());
    }
    let page: ListPage;
    try {
      page = await googleFetch<ListPage>(token, `${calPath(connection.calendarId)}?${params.toString()}`);
    } catch (err) {
      if (incremental && err instanceof GoogleApiError && err.status === 410) {
        return { items: [], nextSyncToken: undefined, full: "expired" };
      }
      throw err;
    }
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
    // Guard against a runaway calendar
    if (items.length > 5000) break;
  } while (pageToken);
  return { items, nextSyncToken, full: !incremental };
}

async function upsertBlock(userId: string, companyId: string, span: BusySpan): Promise<void> {
  const existing = await prisma.timeBlock.findFirst({
    where: { userId, source: "GOOGLE", externalId: span.externalId },
    select: { id: true, title: true, startAt: true, endAt: true, allDay: true },
  });
  const data = { title: span.title, startAt: span.startAt, endAt: span.endAt, allDay: span.allDay };
  if (!existing) {
    await prisma.timeBlock.create({
      data: { companyId, userId, createdById: userId, source: "GOOGLE", externalId: span.externalId, ...data },
    });
    return;
  }
  const same =
    existing.title === data.title &&
    existing.startAt.getTime() === data.startAt.getTime() &&
    existing.endAt.getTime() === data.endAt.getTime() &&
    existing.allDay === data.allDay;
  if (!same) await prisma.timeBlock.update({ where: { id: existing.id, source: "GOOGLE" }, data });
}

/** Drop every mirrored block for a user and forget the sync cursor. */
export async function clearMirroredBlocks(userId: string): Promise<number> {
  const r = await prisma.timeBlock.deleteMany({ where: { userId, source: "GOOGLE" } });
  await prisma.googleCalendarConnection
    .updateMany({ where: { userId }, data: { pullSyncToken: null } })
    .catch(() => {});
  return r.count;
}

/** Poller + cron: every enabled connection, one after another. */
export async function runGoogleCalendarPullSweep(): Promise<{ users: number; upserted: number; removed: number; errors: number }> {
  const totals = { users: 0, upserted: 0, removed: 0, errors: 0 };
  if (!isGoogleCalendarConfigured()) return totals;
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { syncEnabled: true, pullEnabled: true },
    select: { userId: true },
    take: 500,
  });
  for (const c of connections) {
    totals.users++;
    const s = await pullUserGoogleCalendar(c.userId);
    totals.upserted += s.upserted;
    totals.removed += s.removed;
    totals.errors += s.errors;
  }
  return totals;
}
