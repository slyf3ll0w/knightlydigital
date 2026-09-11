import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";

/** Connection state for the My Profile → Calendar sync card. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isGoogleCalendarConfigured();
  const connection = configured
    ? await prisma.googleCalendarConnection.findUnique({
        where: { userId: actor.id },
        select: {
          googleEmail: true,
          syncEnabled: true,
          lastSyncAt: true,
          lastSyncError: true,
          createdAt: true,
          _count: { select: { events: true } },
        },
      })
    : null;

  if (!connection) return NextResponse.json({ configured, connected: false });
  return NextResponse.json({
    configured,
    connected: true,
    googleEmail: connection.googleEmail,
    syncEnabled: connection.syncEnabled,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
    connectedAt: connection.createdAt,
    eventCount: connection._count.events,
  });
}
