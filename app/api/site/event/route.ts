import { NextResponse } from "next/server";
import { clientIp, limit } from "@/lib/rate-limit";
import { recordSiteEvent } from "@/lib/site-events";

/**
 * POST /api/site/event — the marketing site's conversion beacon
 * (lib/site-track.ts). Arrives as text/plain from navigator.sendBeacon, so
 * the body is parsed by hand. Always 204: a tracking failure is never the
 * visitor's problem.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`site-event:${ip}`, 120, 10 * 60_000)).ok) {
    return new NextResponse(null, { status: 204 });
  }
  let body: unknown = null;
  try {
    const text = await req.text();
    if (text.length > 4_000) return new NextResponse(null, { status: 204 });
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (body && typeof body === "object") {
    await recordSiteEvent(body as Parameters<typeof recordSiteEvent>[0]);
  }
  return new NextResponse(null, { status: 204 });
}
