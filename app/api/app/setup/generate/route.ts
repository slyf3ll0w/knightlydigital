import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import {
  generateSetupDraft,
  sanitizeIntake,
  type ExistingServiceInput,
} from "@/lib/setup-wizard";
import { fetchWebsiteInfo } from "@/lib/website-info";

/**
 * POST — draft a personalized account setup (AI with deterministic fallback).
 * Pure read + generate: nothing is written until /api/app/setup/apply.
 * Only non-PII business facts leave the server (see lib/ai.ts privacy note).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  // Generation is the expensive step (external AI call) — keep it bounded
  const rl = limit(`setup-generate:${companyId}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many setup drafts — try again in ${Math.ceil(rl.retryAfterSeconds / 60)} min.` },
      { status: 429 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, website: true },
  });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true, type: "SERVICE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unitPrice: true, durationMinutes: true },
  });
  const existing: ExistingServiceInput[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    price: Number(i.unitPrice),
    durationMinutes: i.durationMinutes,
  }));

  const intake = sanitizeIntake(await req.json().catch(() => ({})));

  // Their real website (confirmed in the lookup step, or already on file)
  // makes the draft match what they actually sell — fetched server-side,
  // soft-fails to a website-less draft.
  const websiteUrl = intake.website || company.website || "";
  const site = websiteUrl ? await fetchWebsiteInfo(websiteUrl) : null;

  const draft = await generateSetupDraft(company.name, intake, existing, site);

  return NextResponse.json({ draft });
}
