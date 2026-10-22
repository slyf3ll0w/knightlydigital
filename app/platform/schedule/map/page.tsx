import { redirect } from "next/navigation";

/**
 * Routes moved to /app/routes (docs/plans/route-manager-redesign-2026-10-19.md).
 * Old links (bookmarks, the help guide, copied route links) land here and
 * carry their day + crew across.
 */
export default async function RouteMapRedirect({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; team?: string }>;
}) {
  const { date, team } = await searchParams;
  const qs = new URLSearchParams();
  if (date) qs.set("date", date);
  if (team) qs.set("team", team);
  const q = qs.toString();
  redirect(`/app/routes${q ? `?${q}` : ""}`);
}
