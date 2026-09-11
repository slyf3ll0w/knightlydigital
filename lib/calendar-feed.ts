/**
 * Private .ics subscribe link (tier 1 of calendar sync — see
 * docs/plans/google-calendar-sync-2026-09-11.md). One row per user; the
 * token is the whole credential, so rotating it kills the old link.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { APP_ORIGIN, loadUserCalendarEvents, resolveUserCalendarScope } from "@/lib/calendar-events";
import { buildIcsCalendar } from "@/lib/ics";

const DAY = 86_400_000;
/** How far the feed reaches: two months back for context, a year ahead. */
export const FEED_PAST_DAYS = 60;
export const FEED_FUTURE_DAYS = 365;

export function feedUrl(token: string): string {
  return `${APP_ORIGIN}/api/public/calendar/${token}.ics`;
}

/** `webcal://` is what Apple Calendar / Outlook desktop open natively. */
export function webcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:\/\//, "webcal://");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getCalendarFeed(userId: string) {
  return prisma.calendarFeed.findUnique({ where: { userId } });
}

/** Create the feed, or rotate the token if one exists. */
export async function rotateCalendarFeed(userId: string) {
  const token = newToken();
  return prisma.calendarFeed.upsert({
    where: { userId },
    create: { userId, token },
    update: { token, lastFetchedAt: null },
  });
}

export async function disableCalendarFeed(userId: string): Promise<void> {
  await prisma.calendarFeed.deleteMany({ where: { userId } });
}

/**
 * Render the feed for a token. Null = no such feed (the route answers 404
 * either way so the token can't be probed).
 */
export async function renderCalendarFeed(
  token: string,
  now: Date = new Date()
): Promise<{ body: string; filename: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const feed = await prisma.calendarFeed.findUnique({
    where: { token },
    select: { id: true, userId: true, user: { select: { name: true, company: { select: { name: true } } } } },
  });
  if (!feed) return null;
  const scope = await resolveUserCalendarScope(feed.userId);
  if (!scope) return null;

  const events = await loadUserCalendarEvents(scope, {
    from: new Date(now.getTime() - FEED_PAST_DAYS * DAY),
    to: new Date(now.getTime() + FEED_FUTURE_DAYS * DAY),
  });
  const companyName = feed.user.company?.name ?? "Workbench";
  const body = buildIcsCalendar(events, {
    name: `${companyName} · ${feed.user.name}`,
    description: `Your Workbench schedule: jobs, appointments, and blocked time.`,
    tz: scope.tz,
    now,
  });

  // Fire-and-forget "last opened" stamp for the settings card
  prisma.calendarFeed
    .update({ where: { id: feed.id }, data: { lastFetchedAt: now } })
    .catch(() => {});

  return { body, filename: `${companyName.replace(/[^\w.-]+/g, "-").toLowerCase()}-schedule.ics` };
}
