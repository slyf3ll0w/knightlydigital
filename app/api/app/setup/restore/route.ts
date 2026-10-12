import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST — bring the Get started checklist back to Home (Settings → Company).
 * Clears setupWizardAt, the stamp Hide (and the old price-book card's
 * dismiss) set. The card still hides itself once every core item is done.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.company.update({
    where: { id: actor.companyId },
    data: { setupWizardAt: null },
  });
  return NextResponse.json({ success: true });
}
