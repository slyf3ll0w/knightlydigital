import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { fmtPhone } from "@/lib/format";

/**
 * GET — the most recent missed (or voicemail) call on the business line,
 * for "call back my last missed call with WorkBench". Siri then places the
 * call through POST /api/app/line/call like the Calls page does.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const call = await prisma.call.findFirst({
    where: { companyId: actor.companyId, direction: "INBOUND", status: { in: ["MISSED", "VOICEMAIL", "NO_ANSWER"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, customerNumber: true, createdAt: true, contact: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!call) return NextResponse.json({ call: null }, { headers: { "Cache-Control": "no-store" } });
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  return NextResponse.json(
    {
      call: {
        id: call.id,
        number: call.customerNumber,
        label: name || fmtPhone(call.customerNumber) || "an unknown number",
        contactId: call.contact?.id ?? null,
        at: call.createdAt.toISOString(),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
