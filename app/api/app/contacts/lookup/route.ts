import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { phoneDigits } from "@/lib/phone";

/**
 * GET ?phone= — who owns this number, if anyone. The dial pad asks as the
 * digits are typed so it can show the name (and their lead/client standing)
 * before the call is placed, and dial them by contact. Matches on
 * Contact.phoneDigits (lib/phone.ts) like every other number comparison.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const digits = phoneDigits(req.nextUrl.searchParams.get("phone"));
  if (!digits || digits.length < 10) return NextResponse.json({ contact: null }, { headers: { "Cache-Control": "no-store" } });
  const contact = await prisma.contact.findFirst({
    where: { companyId: actor.companyId, phoneDigits: digits, status: { not: "ARCHIVED" }, ...contactScope(actor) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, firstName: true, lastName: true, companyName: true, status: true },
  });
  return NextResponse.json(
    {
      contact: contact
        ? {
            id: contact.id,
            name: `${contact.firstName} ${contact.lastName}`.trim() || contact.companyName || "",
            companyName: contact.companyName,
            status: contact.status,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
