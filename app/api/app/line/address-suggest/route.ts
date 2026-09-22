import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { suggestAddresses } from "@/lib/geocoding";

/**
 * GET ?q=<partial address> — Mapbox address suggestions for the texting
 * registration form (components/AddressAutocomplete.tsx). The carrier
 * registry checks the filed address against USPS, so the form offers real,
 * standardised addresses instead of free text. Metered like every geocode.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`address-suggest:${actor.companyId}`, 120, 60_000)).ok) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 4) return NextResponse.json({ suggestions: [] });
  return NextResponse.json({ suggestions: await suggestAddresses(q, actor.companyId) });
}
