import type { Metadata } from "next";
import HelpHome from "@/components/help/HelpHome";
import { requirePageActor } from "@/lib/permissions";
import { DsPage } from "@/components/ds";

export const metadata: Metadata = { title: "Help Center" };

/**
 * Help Center inside the app (/app/help). Same guides as the public /help,
 * in the company's colors, with Atlas and the bug/idea forms at the bottom.
 * Bug reports and feature ideas still live at /app/support.
 */
export default async function AppHelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePageActor();
  const { q } = await searchParams;
  // The open page around the Help Center (white page + entrance at a desk);
  // the guides keep their own layout (components/help, shared with /help).
  return (
    <DsPage open className="rp-help !max-w-none !px-0 !pb-0 !pt-0 lg:!px-0 lg:!pt-0">
      <HelpHome base="/app/help" inApp initialQuery={typeof q === "string" ? q.slice(0, 120) : ""} />
    </DsPage>
  );
}
