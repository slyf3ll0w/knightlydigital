import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fmtPhone } from "@/lib/format";
import { getActor, canSell } from "@/lib/permissions";
import { callPeopleView } from "@/lib/voice";
import { inviteLine } from "@/lib/voice-conference";

/**
 * GET ?id=<callId> — one call, as the softphone bar and the call screen show
 * it (status, who, contact link, and who else is on it: `people`, lib/voice.ts
 * callPeopleView). Without `id`: the call ringing THIS user's browser right
 * now — an inbound call with an open leg to them, an outbound one they
 * placed from the app, or a live call a teammate is adding them to — so the
 * bar can name the caller even when the SIP INVITE's headers didn't make it
 * through the SDK. `invite` is set when the viewer is being added to this
 * call: the card then says who wants them and with whom. Company-scoped.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  const select = {
    id: true,
    direction: true,
    status: true,
    via: true,
    userId: true,
    answeredByUserId: true,
    telnyxCallId: true,
    agentCallId: true,
    conferenceId: true,
    customerNumber: true,
    answeredAt: true,
    contact: { select: { id: true, firstName: true, lastName: true } },
    participants: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        kind: true,
        status: true,
        userId: true,
        contactId: true,
        number: true,
        label: true,
        telnyxCallId: true,
        addedByUserId: true,
        joinedAt: true,
        leftAt: true,
        createdAt: true,
      },
    },
  } as const;
  const call = id
    ? await prisma.call.findFirst({ where: { id, companyId: actor.companyId }, select })
    : await prisma.call.findFirst({
        where: {
          companyId: actor.companyId,
          OR: [
            { status: "RINGING", direction: "INBOUND", legs: { some: { userId: actor.id, endedAt: null } } },
            { status: "RINGING", direction: "OUTBOUND", via: "app", userId: actor.id },
            { status: "IN_PROGRESS", participants: { some: { kind: "team", userId: actor.id, status: "ringing" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select,
      });
  if (!call) return NextResponse.json({ call: null }, { headers: { "Cache-Control": "no-store" } });
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  const label = name || fmtPhone(call.customerNumber) || "Unknown caller";
  // Being added to this call: the card says who wants them, not "incoming call".
  const pending = call.participants.find((p) => p.kind === "team" && p.userId === actor.id && p.status === "ringing");
  const by = pending ? await prisma.user.findUnique({ where: { id: pending.addedByUserId }, select: { name: true } }) : null;
  return NextResponse.json(
    {
      call: {
        id: call.id,
        direction: call.direction,
        status: call.status,
        label,
        number: call.customerNumber,
        contactId: call.contact?.id ?? null,
        answeredAt: call.answeredAt?.toISOString() ?? null,
        invite: pending ? inviteLine(by?.name ?? "", label) : null,
        people: callPeopleView(call, actor.id),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
