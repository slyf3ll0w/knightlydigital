import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isGoogleCalendarConfigured, syncUserGoogleCalendar } from "@/lib/google-calendar";
import { pullUserGoogleCalendar } from "@/lib/google-calendar-pull";

/** "Sync now" — Google → Workbench pull, then the push reconcile; reports both. */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar isn't configured on this server yet." }, { status: 503 });
  }
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: actor.id } });
  if (!connection) return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 404 });
  if (!connection.syncEnabled) {
    // A paused-by-error connection needs a fresh grant, not a retry
    await prisma.googleCalendarConnection.update({ where: { id: connection.id }, data: { syncEnabled: true } });
  }
  const pull = await pullUserGoogleCalendar(actor.id);
  const summary = await syncUserGoogleCalendar(actor.id);
  return NextResponse.json({ ok: true, ...summary, pull });
}
