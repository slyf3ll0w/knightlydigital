import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress, geocodingEnabled } from "@/lib/geocoding";
import { limit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/public/geocode?q=… — centre the estimate form's map on an address
 * (lib/geocoding.ts: cache-first Mapbox, platform-metered, budget-capped).
 * Public because the map lives on public estimate forms; rate-limited per
 * visitor so nobody turns it into a free geocoder. 404 = no pin.
 */
export async function GET(req: NextRequest) {
  if (!geocodingEnabled()) return NextResponse.json({ error: "Address search isn't available — pan the map to the property instead." }, { status: 503 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 4) return NextResponse.json({ error: "Type a fuller address." }, { status: 400 });
  const ip = clientIp(req.headers);
  if (!(await limit(`public-geocode:${ip}`, 30, 600_000)).ok) {
    return NextResponse.json({ error: "Too many searches — pan the map instead." }, { status: 429 });
  }
  const hit = await geocodeAddress(q, null);
  if (!hit) return NextResponse.json({ error: "We couldn't find that address — try adding the city, or pan the map to it." }, { status: 404 });
  return NextResponse.json({ lat: hit.lat, lng: hit.lng });
}
