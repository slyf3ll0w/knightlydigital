import type { Metadata } from "next";
import HelpHome from "@/components/help/HelpHome";
import { helpArticleCount } from "@/lib/help/search";

export const metadata: Metadata = {
  title: "Help Center",
  description: `How to use WorkBench FSM: ${helpArticleCount()} step-by-step guides to booking, scheduling, quotes, invoices, payments, the business phone line, texting, automations and Atlas, with fixes for common problems.`,
};

/**
 * Public Help Center (workbenchfsm.com/help). The same guides as the
 * in-app /app/help, in WorkBench blue/orange, readable by search engines
 * and outside AI assistants (plain-text copy at /help/all.md).
 */
export default async function PublicHelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <HelpHome base="/help" inApp={false} initialQuery={typeof q === "string" ? q.slice(0, 120) : ""} />
  );
}
