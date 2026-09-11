import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import {
  disableCalendarFeed,
  feedUrl,
  getCalendarFeed,
  rotateCalendarFeed,
  webcalUrl,
} from "@/lib/calendar-feed";

/**
 * The signed-in user's own subscribe link (My Profile → Calendar sync).
 *   GET    → { url, webcalUrl, lastFetchedAt } or { url: null }
 *   POST   → create, or rotate the token if one exists (old link dies)
 *   DELETE → turn the feed off
 * Any role — it's their own schedule.
 */

function shape(feed: { token: string; lastFetchedAt: Date | null; createdAt: Date } | null) {
  if (!feed) return { url: null, webcalUrl: null, lastFetchedAt: null, createdAt: null };
  return {
    url: feedUrl(feed.token),
    webcalUrl: webcalUrl(feed.token),
    lastFetchedAt: feed.lastFetchedAt,
    createdAt: feed.createdAt,
  };
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(shape(await getCalendarFeed(actor.id)));
}

export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const feed = await rotateCalendarFeed(actor.id);
  return NextResponse.json(shape(feed), { status: 201 });
}

export async function DELETE() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await disableCalendarFeed(actor.id);
  return NextResponse.json({ ok: true });
}
