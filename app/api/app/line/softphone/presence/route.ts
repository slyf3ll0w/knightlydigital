import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { softphoneHeartbeat } from "@/lib/softphone";

/**
 * POST { online: boolean } — the softphone's heartbeat (every ~30 s while
 * registered) and its goodbye (sendBeacon on pagehide). Inbound calls fan
 * out to every user with a fresh heartbeat (lib/softphone.ts). The body may
 * arrive as text/plain from sendBeacon, so it's parsed by hand.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let online = true;
  try {
    const j = JSON.parse((await req.text()) || "{}") as { online?: unknown };
    online = j.online !== false;
  } catch {
    /* an unreadable beacon still counts as "here" */
  }
  await softphoneHeartbeat(actor.id, online).catch((err) => console.error("[softphone] heartbeat failed:", err));
  return NextResponse.json({ ok: true });
}
