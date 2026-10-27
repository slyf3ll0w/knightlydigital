import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { pushPublicKey } from "@/lib/push";

/**
 * Push subscription management for the signed-in user. GET hands the browser
 * the VAPID public key (null = push not configured in this environment);
 * POST registers/refreshes this device's subscription; DELETE removes it.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: pushPublicKey });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  // Native app (Capacitor shell): body = { platform: "ios"|"android", token }
  // where token is the FCM device token, stored in the endpoint column —
  // or platform "ios-voip", the PushKit token that rings the iPhone for a
  // business-line call when the app is closed, or "android-voip", the same
  // FCM token registered by the Android calling engine (lib/voip.ts). The
  // Android page registers that one token twice ("android" from
  // components/PushNotifications.tsx, "android-voip" from the engine);
  // "android-voip" wins and stays, because it says the shell can be rung
  // and still receives every ordinary notification.
  if (body?.platform === "ios" || body?.platform === "android" || body?.platform === "ios-voip" || body?.platform === "android-voip") {
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 4096 || token.includes(" ")) {
      return NextResponse.json({ error: "Invalid device token." }, { status: 400 });
    }
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: token }, select: { platform: true } });
    const platform = body.platform === "android" && existing?.platform === "android-voip" ? "android-voip" : body.platform;
    await prisma.pushSubscription.upsert({
      where: { endpoint: token },
      create: {
        userId: actor.id,
        endpoint: token,
        platform,
        userAgent,
      },
      update: { userId: actor.id, platform },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Web: standard PushSubscription JSON
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // endpoint is unique per browser profile — re-subscribing (or another user
  // signing in on the same device) takes the row over rather than duplicating
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: actor.id,
      endpoint,
      p256dh,
      auth,
      userAgent,
    },
    update: { userId: actor.id, p256dh, auth },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Endpoint required." }, { status: 400 });

  // A VoIP token may sit on a sibling membership of the same login (the
  // phone rings for every company on it — lib/voip.ts); signing out must
  // drop it wherever it is, or the phone keeps ringing for a signed-out app.
  const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { accountId: true } });
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, OR: [{ userId: actor.id }, ...(me?.accountId ? [{ user: { accountId: me.accountId } }] : [])] },
  });
  return NextResponse.json({ ok: true });
}
