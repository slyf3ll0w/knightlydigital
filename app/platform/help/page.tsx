import type { Metadata } from "next";
import { DsPage } from "@/components/ds";
import HelpHome from "@/components/help/HelpHome";
import { requirePageActor } from "@/lib/permissions";

export const metadata: Metadata = { title: "Help Center" };

/**
 * Help Center inside the app (/app/help). Same guides as the public /help,
 * in the company's colors, with Atlas and the bug/idea forms at the bottom.
 * Bug reports and feature ideas still live at /app/support.
 */
export default async function AppHelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePageActor();
  const { q } = await searchParams;
  return (
    <DsPage className="max-w-6xl">
      <HelpHome base="/app/help" inApp initialQuery={typeof q === "string" ? q.slice(0, 120) : ""} />
    </DsPage>
  );
}
