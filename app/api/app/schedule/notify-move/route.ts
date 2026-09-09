import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope, appointmentScope } from "@/lib/permissions";
import { notifyClientOfMove } from "@/lib/schedule-notify";

/**
 * POST /api/app/schedule/notify-move — the calendar's "Text client" button
 * after a drag. Body: { kind: "job" | "appointment", id, previousStart?,
 * previousAnytime? }. Sends the client their new time (SMS and/or email).
 *
 * Anyone who can see the item can send it — techs moving their own day
 * included — since the message only says what the calendar already says.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "appointment" ? "appointment" : body.kind === "job" ? "job" : null;
  const id = typeof body.id === "string" ? body.id : "";
  if (!kind || !id) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const visible =
    kind === "job"
      ? await prisma.job.findFirst({ where: { id, companyId: actor.companyId, ...jobScope(actor) }, select: { id: true } })
      : await prisma.appointment.findFirst({
          where: {
            id,
            companyId: actor.companyId,
            ...(isManager(actor.role) || actor.role === "USER" ? {} : appointmentScope(actor)),
          },
          select: { id: true },
        });
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const previousStart =
    typeof body.previousStart === "string" && !isNaN(Date.parse(body.previousStart))
      ? new Date(body.previousStart)
      : null;

  const result = await notifyClientOfMove({
    companyId: actor.companyId,
    kind,
    id,
    previousStart,
    previousAnytime: Boolean(body.previousAnytime),
    senderId: actor.id,
  });

  if (!result.sent) {
    const msg =
      result.reason === "opted_out"
        ? "This client has opted out of texts and has no email on file."
        : result.reason === "no_contact_method"
          ? "No phone or email on file for this client."
          : result.reason === "unscheduled"
            ? "Nothing to send — it isn't scheduled."
            : "Couldn't send right now. Please try again.";
    return NextResponse.json({ error: msg, ...result }, { status: 422 });
  }
  return NextResponse.json({ success: true, ...result });
}
