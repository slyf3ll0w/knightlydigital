import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolPage from "@/components/wb/tools/ToolPage";
import { TOOLS, toolBySlug, toolPath } from "@/lib/wb-tools";

/** /tools/invoice-generator and /tools/estimate-generator. */

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) return {};
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: `https://workbenchfsm.com${toolPath(tool)}` },
  };
}

export default async function GeneratorPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) notFound();
  return <ToolPage tool={tool} />;
}
