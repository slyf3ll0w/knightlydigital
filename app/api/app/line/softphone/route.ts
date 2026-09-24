import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { SoftphoneError, issueSoftphoneGrant } from "@/lib/softphone";
import { membershipOf } from "@/lib/voip";

/**
 * GET — what the browser softphone (components/Softphone.tsx) needs to
 * register with Telnyx: a short-lived JWT + the SIP username, or
 * `{ off: reason }` when calls shouldn't ring in this browser (no routed
 * line, add-on lapsed, the user switched it off in My Profile, …). Minted
 * per page load, nothing is stored client-side. Rate-limited because every
 * grant is a Telnyx round trip (and the first one creates resources).
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The iPhone's native engine may register as another membership of this
  // login, for a call of that company (lib/voip.ts membershipOf).
  const membership = req.nextUrl.searchParams.get("membership");
  const as = membership ? await membershipOf(actor.id, membership) : { id: actor.id, companyId: actor.companyId };
  if (!as) return NextResponse.json({ off: "role" });
  if (!membership && !canSell(actor.role)) return NextResponse.json({ off: "role" });
  // Generous: a healthy tab mints one per page load; the client backs off 3 min on a 429.
  if (!(await limit(`softphone-grant:${actor.id}`, 60, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many softphone connections in a row — give it a few minutes." }, { status: 429 });
  }
  try {
    // The iPhone app registers with its own credential (`device=ios`), never the browser's.
    const device = req.nextUrl.searchParams.get("device") === "ios" ? "ios" : "browser";
    return NextResponse.json(await issueSoftphoneGrant(as.id, as.companyId, device), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SoftphoneError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[softphone] grant failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
