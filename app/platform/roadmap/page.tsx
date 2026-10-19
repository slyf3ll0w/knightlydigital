import { redirect } from "next/navigation";

/**
 * The in-app Upcoming Features board is switched off for now (David
 * 2026-10-19) — see app/roadmap/page.tsx. Old links land on the Help Center.
 */
export default function AppRoadmapPage() {
  redirect("/app/help");
}
