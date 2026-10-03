import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { touchPresence } from "@/lib/presence";

/**
 * The "I'm looking at the app" heartbeat (components/PresenceBeacon.tsx):
 * sent only while the page is visible, it is the whole "online / last seen"
 * system the platform console reads (lib/presence.ts). Throttled there, so a
 * burst of beats costs one write.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  touchPresence(actor.id, actor.companyId, req.headers.get("user-agent"));
  return new NextResponse(null, { status: 204 });
}
