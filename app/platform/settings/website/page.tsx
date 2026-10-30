import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { loadWebsiteSummary } from "@/lib/website";
import WebsiteSettingsClient from "./WebsiteSettingsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website" };

/**
 * Settings → Website: a custom site built for the business by the studio
 * (docs/plans/client-websites-2026-10-05.md). The owner fills the brand
 * brief, adds photos, sends it in, and watches the status here. The site
 * itself reads this brief plus the company's public facts at build time.
 */
export default async function WebsiteSettingsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  // Test accounts only while the studio feature is being finished
  // (2026-10-30 request) — the nav hides the door for everyone else, and a
  // bookmark lands on Settings.
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { isTest: true } });
  if (!company?.isTest) redirect("/app/settings");
  const summary = await loadWebsiteSummary(actor.companyId);
  return <WebsiteSettingsClient initial={summary} />;
}
