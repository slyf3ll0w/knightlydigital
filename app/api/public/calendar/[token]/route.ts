import { NextRequest, NextResponse } from "next/server";
import { limit, clientIp } from "@/lib/rate-limit";
import { renderCalendarFeed } from "@/lib/calendar-feed";

/**
 * Private .ics subscribe feed — `GET /api/public/calendar/<token>[.ics]`.
 * The token is the credential (lib/calendar-feed.ts): anything else 404s
 * with an empty body, so the route can't be used to tell feeds apart.
 * Calendar apps poll this on their own clock (Google ~12–24 h, Apple hourly)
 * — no auth cookie, no session, and no HTML, ever.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req.headers);
  if (!(await limit(`calendar-feed:${ip}`, 120, 60 * 60_000)).ok) {
    return new NextResponse(null, { status: 429 });
  }
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  const feed = await renderCalendarFeed(token);
  if (!feed) return new NextResponse(null, { status: 404 });
  return new NextResponse(feed.body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${feed.filename}"`,
      // Private to whoever holds the link; a short TTL lets a busy office
      // behind one client re-fetch without re-rendering every minute.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
