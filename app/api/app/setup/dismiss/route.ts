import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * POST — Hide on the Get started checklist. Stamps getStartedHiddenAt, the
 * checklist's own flag (setupWizardAt is left alone: it means the old
 * setup wizard ran and the superadmin console still reads it).
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.company.update({
    where: { id: actor.companyId },
    data: { getStartedHiddenAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
