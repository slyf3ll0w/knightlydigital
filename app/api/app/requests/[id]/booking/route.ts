import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";

/**
 * Approve or decline a self-scheduled online booking.
 *
 * POST { action: "accept" }  — confirms the tentative appointment (it turns
 * solid on the schedule) and puts the request back in the normal NEW flow.
 * POST { action: "decline", message? } — archives the request and cancels
 * the tentative appointment, freeing the slot.
 *
 * Client emails ride lib/email.ts (confirmation / declined) — see the
 * booking email templates.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : null;
  if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const request = await prisma.request.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    include: {
      contact: { select: { id: true, firstName: true, email: true } },
      appointments: {
        where: { tentative: true, status: "SCHEDULED" },
        orderBy: { scheduledAt: "asc" },
      },
      company: { select: { name: true, email: true, timezone: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "NEEDS_APPROVAL") {
    return NextResponse.json(
      { error: "This request isn't awaiting booking approval." },
      { status: 400 }
    );
  }

  const tentative = request.appointments[0] ?? null;

  if (action === "accept") {
    await prisma.$transaction([
      prisma.request.update({ where: { id: request.id }, data: { status: "NEW" } }),
      ...(tentative
        ? [
            prisma.appointment.update({
              where: { id: tentative.id },
              data: { tentative: false },
            }),
          ]
        : []),
    ]);
  } else {
    await prisma.$transaction([
      prisma.request.update({ where: { id: request.id }, data: { status: "ARCHIVED" } }),
      ...(tentative
        ? [
            prisma.appointment.update({
              where: { id: tentative.id },
              data: { status: "CANCELLED" },
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json({ success: true, action });
}
