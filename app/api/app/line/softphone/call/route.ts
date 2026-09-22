import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fmtPhone } from "@/lib/format";
import { getActor, canSell } from "@/lib/permissions";

/**
 * GET ?id=<callId> — one call, as the softphone bar shows it (status, who,
 * contact link). Without `id`: the call ringing THIS user's browser right
 * now — an inbound call with an open leg to them, or an outbound one they
 * placed from the app — so the bar can name the caller even when the SIP
 * INVITE's headers didn't make it through the SDK. Company-scoped.
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
    customerNumber: true,
    answeredAt: true,
    contact: { select: { id: true, firstName: true, lastName: true } },
  } as const;
  const call = id
    ? await prisma.call.findFirst({ where: { id, companyId: actor.companyId }, select })
    : await prisma.call.findFirst({
        where: {
          companyId: actor.companyId,
          status: "RINGING",
          OR: [
            { direction: "INBOUND", legs: { some: { userId: actor.id, endedAt: null } } },
            { direction: "OUTBOUND", via: "app", userId: actor.id },
          ],
        },
        orderBy: { createdAt: "desc" },
        select,
      });
  if (!call) return NextResponse.json({ call: null }, { headers: { "Cache-Control": "no-store" } });
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  return NextResponse.json(
    {
      call: {
        id: call.id,
        direction: call.direction,
        status: call.status,
        label: name || fmtPhone(call.customerNumber) || "Unknown caller",
        number: call.customerNumber,
        contactId: call.contact?.id ?? null,
        answeredAt: call.answeredAt?.toISOString() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
