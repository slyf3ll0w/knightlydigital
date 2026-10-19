import { notFound } from "next/navigation";

/**
 * The public Upcoming Features board is switched off for now (David
 * 2026-10-19) — the Help Center stays. RoadmapClient, lib/roadmap.ts, the
 * /api/roadmap routes and the superadmin feedback → roadmap link all remain
 * so the board can come back by restoring this page (and /app/roadmap) plus
 * the links in WBFooter, Footer, the dashboard footer, Support, sitemap,
 * llms.txt and lib/mobile-nav.ts.
 */
export const dynamic = "force-dynamic";

export default function RoadmapPage() {
  notFound();
}
