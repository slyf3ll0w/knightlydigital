import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST — dismiss the dashboard "price book is ready" card. Stamps
 * setupWizardAt (the flag predates the AI setup wizard's removal and keeps
 * its name so existing rows still count as dismissed).
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
