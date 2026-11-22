import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor, isManager } from "@/lib/permissions";

export const metadata: Metadata = { title: "Reports" };

/**
 * Reports (2026-11-21): the Business "Overview" used to be four doorway
 * cards to Insights, Team map, Timesheets and Expenses. Those are now tabs
 * of one Reports page (components/ReportsHeader.tsx renders the shared
 * header + tab strip on each), so /app/business — still the sidebar row,
 * Help links and Atlas cards — opens the first tab.
 */
export default async function BusinessPage() {
  await requirePageActor((a) => isManager(a.role));
  redirect("/app/insights");
}
