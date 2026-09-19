import { companyMetaBySlug } from "@/lib/client-meta";
import EstimateView, { type EstimateSearchParams } from "../EstimateView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Get an estimate");
}

/** /book/[slug]/estimate/[tool] — an estimate tool as a hosted website form. */
export default async function EstimatePage({ params, searchParams }: { params: Promise<{ slug: string; tool: string }>; searchParams: Promise<EstimateSearchParams> }) {
  const { slug, tool } = await params;
  return <EstimateView companySlug={slug} toolSlug={tool} searchParams={await searchParams} />;
}
