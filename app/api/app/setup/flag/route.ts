import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST { key } — stamp a Get started signal the data model can't see on
 * its own. Idempotent: the first stamp wins, later calls are no-ops.
 *
 *   bookingLinkShared — the booking link / embed snippet was copied once
 *                       (Settings → Booking & forms).
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let key = "";
  try {
    key = String(((await req.json()) as { key?: unknown })?.key ?? "");
  } catch {
    // no body
  }
  if (key !== "bookingLinkShared") {
    return NextResponse.json({ error: "Nothing to record — reload the page and try again." }, { status: 400 });
  }

  await prisma.company.updateMany({
    where: { id: actor.companyId, bookingLinkSharedAt: null },
    data: { bookingLinkSharedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
