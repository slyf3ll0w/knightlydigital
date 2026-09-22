import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { INDUSTRIES } from "@/lib/pricebooks";
import LibraryClient from "./LibraryClient";

export const metadata: Metadata = { title: "Library" };

/**
 * /app/estimates/library — estimate tools other Workbench businesses have
 * shared (docs/plans/ai-estimators-2026-09-19.md, Batch 10). Anyone who
 * can sell may browse, preview and like; managers add a copy to their own
 * tools. The list itself loads client-side from /api/app/library.
 */
export default async function LibraryPage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { industry: true } });
  const industry = company?.industry && (INDUSTRIES as readonly string[]).includes(company.industry) && company.industry !== "Other" ? company.industry : "";
  return <LibraryClient manager={isManager(actor.role)} defaultIndustry={industry} />;
}
