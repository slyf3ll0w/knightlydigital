import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { featureAllowed, featureLabel, type GatedFeature } from "@/lib/plans";

/**
 * Server-side plan gate for Pro features (lib/plans.ts decides; this only
 * loads the company and shapes the refusal). The gate is dark until
 * PLAN_GATING=1 — every check answers "allowed" before that, so the code
 * ships ahead of the whitelist and flips on with one Railway variable
 * (docs/plans/pricing-plans-2026-09-25.md, "Gating").
 *
 *   const gate = await checkFeature(actor.companyId, "routes");
 *   if (!gate.ok) return gate.response;   // 402 { error, code: "PLAN_REQUIRED", plan: "SHOP" }
 */

export const PLAN_REQUIRED_CODE = "PLAN_REQUIRED";

export async function featureAllowedFor(companyId: string, feature: GatedFeature): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { planGrants: true, addonActiveAt: true },
  });
  if (!company) return false;
  return featureAllowed(company, feature);
}

export async function checkFeature(
  companyId: string,
  feature: GatedFeature
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (await featureAllowedFor(companyId, feature)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      { error: `${featureLabel(feature)} is part of the Pro plan.`, code: PLAN_REQUIRED_CODE, plan: "SHOP" },
      { status: 402 }
    ),
  };
}
