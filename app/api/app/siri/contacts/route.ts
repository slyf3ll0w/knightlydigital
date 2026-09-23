import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { fmtPhone } from "@/lib/format";

/**
 * GET ?q=maria — clients by name, for Siri's "Call/Text ‹client› with
 * WorkBench" (the ClientEntity query in ios/App/App/Intents.swift).
 * GET ?ids=a,b — the same shape for ids Siri remembered from an earlier
 * pick. Only clients with a phone number: those are the ones a call or a
 * text can reach. Ten at most; Siri offers a disambiguation list from it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ contacts: [] });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const words = q.split(/\s+/).filter(Boolean);

  const rows = await prisma.contact.findMany({
    where: {
      companyId: actor.companyId,
      ...contactScope(actor),
      phone: { not: null },
      ...(ids.length
        ? { id: { in: ids } }
        : words.length
          ? {
              AND: words.map((w) => ({
                OR: [{ firstName: { contains: w, mode: "insensitive" } }, { lastName: { contains: w, mode: "insensitive" } }],
              })),
            }
          : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 10,
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  return NextResponse.json(
    {
      contacts: rows.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        phone: c.phone ? fmtPhone(c.phone) : null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
