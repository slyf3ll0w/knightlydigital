import type { Metadata } from "next";
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
  const summary = await loadWebsiteSummary(actor.companyId);
  return <WebsiteSettingsClient initial={summary} />;
}
