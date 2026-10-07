import { NextRequest, NextResponse } from "next/server";
import { loadSiteData } from "@/lib/website";
import { limit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/site/[slug] — everything the company's static site needs,
 * as one JSON document (lib/website.ts loadSiteData). Read by the
 * workbench-sites build (and by anyone — it's the booking page's public
 * facts plus the brief the owner sent to the studio). Bare 404 for an
 * unknown, suspended or unapproved company and for any company whose
 * website is not in the studio, in review or live; cached only briefly so
 * a status change shows up within a minute.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = clientIp(req.headers);
  if (!(await limit(`site-data:${ip}`, 60, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { slug } = await params;
  const data = await loadSiteData(slug.slice(0, 80));
  if (!data) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60", "Access-Control-Allow-Origin": "*" },
    });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300", "Access-Control-Allow-Origin": "*" },
  });
}
