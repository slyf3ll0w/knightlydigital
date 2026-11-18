import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { pickerSources } from "@/lib/lead-source";

/**
 * GET — the lead-source pick list for this company: the standard names, then
 * every other source its clients and jobs already carry (one spelling each).
 * Read by components/LeadSourceField.tsx.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [contacts, jobs] = await Promise.all([
    prisma.contact.groupBy({
      by: ["leadSource"],
      where: { companyId: actor.companyId, leadSource: { not: null }, placeholder: false },
      _count: true,
      orderBy: { _count: { leadSource: "desc" } },
      take: 60,
    }),
    prisma.job.groupBy({
      by: ["leadSource"],
      where: { companyId: actor.companyId, leadSource: { not: null } },
      _count: true,
      orderBy: { _count: { leadSource: "desc" } },
      take: 40,
    }),
  ]);
  const used = [...contacts, ...jobs].map((r) => r.leadSource);
  return NextResponse.json({ sources: pickerSources(used).slice(0, 80) }, { headers: { "Cache-Control": "no-store" } });
}
