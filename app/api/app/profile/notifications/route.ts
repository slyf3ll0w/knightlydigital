import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isNotificationChannel, isNotificationEvent, preferenceMap } from "@/lib/notification-events";

/**
 * The signed-in member's alert switches (My Profile → Notifications;
 * lib/notification-events.ts). Per membership: the same person can want
 * different alerts from two companies.
 *
 * GET → { prefs: { [event]: { push, bell, email } } } with defaults filled in.
 * PUT { event, channel, enabled } → one switch; answers the full grid.
 */
async function grid(userId: string) {
  return preferenceMap(
    await prisma.notificationPreference.findMany({ where: { userId }, select: { event: true, channel: true, enabled: true } })
  );
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ prefs: await grid(actor.id) });
}

export async function PUT(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { event, channel, enabled } = body ?? {};
  if (!isNotificationEvent(event) || !isNotificationChannel(channel) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Send an event, a channel (push, bell or email) and enabled true or false." }, { status: 400 });
  }
  await prisma.notificationPreference.upsert({
    where: { userId_event_channel: { userId: actor.id, event, channel } },
    create: { userId: actor.id, event, channel, enabled },
    update: { enabled },
  });
  return NextResponse.json({ prefs: await grid(actor.id) });
}
