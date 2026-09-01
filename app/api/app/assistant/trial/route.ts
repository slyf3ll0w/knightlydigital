import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { aiEnabled } from "@/lib/ai";
import { ATLAS_TRIAL_TURNS } from "@/lib/assistant-access";
import { inPreview, previewBlockedError } from "@/lib/preview";

/**
 * POST — start the company's free Atlas trial (ATLAS_TRIAL_TURNS assistant
 * turns). One trial per company, ever; owners/admins only. The paywall panel
 * in the assistant drawer is the only caller.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) {
    return NextResponse.json(
      { error: "Only an owner or admin can start the Atlas trial." },
      { status: 403 }
    );
  }
  if (await inPreview(actor.companyId)) {
    return NextResponse.json(previewBlockedError("Atlas, your AI assistant,"), { status: 403 });
  }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "The assistant isn't available right now." }, { status: 503 });
  }

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { assistantEnabled: true, atlasTrialStartedAt: true },
  });
  if (!company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A forced-on company doesn't need the trial; a forced-off one doesn't get it.
  if (company.assistantEnabled !== null) {
    return NextResponse.json(
      { error: "Atlas access is managed for this account." },
      { status: 400 }
    );
  }
  if (company.atlasTrialStartedAt) {
    return NextResponse.json(
      { error: "This account's free trial has already been used." },
      { status: 409 }
    );
  }

  // Conditional write so two racing clicks can't both "start" it.
  const started = await prisma.company.updateMany({
    where: { id: actor.companyId, atlasTrialStartedAt: null },
    data: { atlasTrialStartedAt: new Date() },
  });
  if (started.count === 0) {
    return NextResponse.json(
      { error: "This account's free trial has already been used." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, turns: ATLAS_TRIAL_TURNS });
}
