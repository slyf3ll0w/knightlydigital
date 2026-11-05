import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolPage from "@/components/tools/ToolPage";
import { TRADES, tradeBySlug } from "@/lib/wb-trades";
import { TOOLS, templatePath, toolByTemplateSlug } from "@/lib/wb-tools";

/** /tools/invoice-template/<trade> and /tools/estimate-template/<trade>. */

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.flatMap((tool) => TRADES.map((t) => ({ tool: tool.templateSlug, trade: t.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string; trade: string }> }): Promise<Metadata> {
  const { tool: toolSlug, trade: tradeSlug } = await params;
  const tool = toolByTemplateSlug(toolSlug);
  const trade = tradeBySlug(tradeSlug);
  if (!tool || !trade) return {};
  const noun = tool.noun;
  return {
    title: `Free ${trade.name.toLowerCase()} ${noun} template (PDF, editable)`,
    description: `A free ${trade.name.toLowerCase()} ${noun} template with the line items ${trade.noun} usually bills, ready to edit in your browser. Add your logo and colors, download the PDF. No account, no email, no watermark. From WorkBench FSM.`,
    alternates: { canonical: `https://workbenchfsm.com${templatePath(tool, trade)}` },
  };
}

export default async function TemplatePage({ params }: { params: Promise<{ tool: string; trade: string }> }) {
  const { tool: toolSlug, trade: tradeSlug } = await params;
  const tool = toolByTemplateSlug(toolSlug);
  const trade = tradeBySlug(tradeSlug);
  if (!tool || !trade) notFound();
  return <ToolPage tool={tool} trade={trade} />;
}
