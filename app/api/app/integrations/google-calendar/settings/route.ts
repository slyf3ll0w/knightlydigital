import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { clearMirroredBlocks, pullUserGoogleCalendar } from "@/lib/google-calendar-pull";

/**
 * PATCH the two-way settings on the signed-in user's Google connection:
 *   pullEnabled — mirror Google busy time into Workbench (off = mirrored
 *                 blocks are removed right away)
 *   shareTitles — mirrored blocks show the Google event name instead of
 *                 "Busy" (teammates on the company calendar see it too)
 * Either change re-reads the window so the blocks match the new setting.
 */
export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: actor.id } });
  if (!connection) return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { pullEnabled?: boolean; shareTitles?: boolean } = {};
  if (typeof body.pullEnabled === "boolean") data.pullEnabled = body.pullEnabled;
  if (typeof body.shareTitles === "boolean") data.shareTitles = body.shareTitles;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await prisma.googleCalendarConnection.update({ where: { id: connection.id }, data });
  // Start the mirror over under the new rules (or take it down)
  const removed = await clearMirroredBlocks(actor.id);
  const pull = data.pullEnabled === false || (data.pullEnabled === undefined && !connection.pullEnabled)
    ? null
    : await pullUserGoogleCalendar(actor.id);
  return NextResponse.json({ ok: true, removed, pull });
}
