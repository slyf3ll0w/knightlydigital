import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { reverseGeocodeAddress } from "@/lib/geocoding";

/**
 * GET ?lat=&lng= — the street address at a position, for the "Use my
 * location" button on the client, lead and property forms
 * (components/UseMyLocation.tsx). The phone reads its own GPS; this just
 * turns the fix into street / city / state / ZIP. Metered like every geocode.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await limit(`reverse-geocode:${actor.id}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many location lookups — try again in a minute." }, { status: 429 });
  }
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid position." }, { status: 400 });
  }
  const address = await reverseGeocodeAddress(lat, lng, actor.companyId);
  return NextResponse.json({ address });
}
