import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { suggestAddresses } from "@/lib/geocoding";

/**
 * GET ?q=<partial address> — street-address suggestions as someone types a
 * client's address (components/AddressAutocomplete.tsx on the client, lead
 * and quick-add forms; streamline batch 1, 2026-10-16). The texting
 * registration form has its own manager-only copy at
 * /api/app/line/address-suggest; this one is open to anyone who can add a
 * client. Metered like every geocode, and rate-limited per person.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`address-suggest:${actor.id}`, 90, 60_000)).ok) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 4) return NextResponse.json({ suggestions: [] });
  return NextResponse.json({ suggestions: await suggestAddresses(q, actor.companyId) });
}
