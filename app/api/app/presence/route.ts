import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { touchPresence } from "@/lib/presence";
import { DEVICE_COOKIE, claimDevice, deviceCookieOptions, deviceRuleEnabled, isDeviceId } from "@/lib/active-device";

/**
 * The "I'm looking at the app" heartbeat (components/PresenceBeacon.tsx):
 * sent only while the page is visible, it is the whole "online / last seen"
 * system the platform console reads (lib/presence.ts) and, since 2026-10-02,
 * the one-active-device check (lib/active-device.ts).
 *
 * Body: `{}` for a plain beat, `{ takeover: true }` from the "Use it here"
 * button. Answers `{ ok: true }` or `{ busy: true, device, since }`; a busy
 * device is not stamped as present (the person is looking at a wall, not
 * the app). The first beat from a browser gets its `wb_device` cookie here.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ua = req.headers.get("user-agent");
  const cookie = req.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = isDeviceId(cookie) ? cookie : randomUUID();

  let takeover = false;
  try {
    const body = (await req.json()) as { takeover?: unknown } | null;
    takeover = body?.takeover === true;
  } catch {
    // no body / not JSON = a plain beat
  }

  const decision = deviceRuleEnabled() ? await claimDevice(actor.id, deviceId, ua, takeover) : { kind: "claim" as const };

  if (decision.kind !== "busy") touchPresence(actor.id, actor.companyId, ua);

  const res = NextResponse.json(
    decision.kind === "busy" ? { busy: true, device: decision.device, since: decision.since.toISOString() } : { ok: true }
  );
  if (deviceId !== cookie) res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions());
  return res;
}
