import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST — dismiss the dashboard setup card without running the wizard.
 * Stamps setupWizardAt (same flag as applying); the wizard itself stays
 * reachable from Settings.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.company.update({
    where: { id: actor.companyId },
    data: { setupWizardAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
