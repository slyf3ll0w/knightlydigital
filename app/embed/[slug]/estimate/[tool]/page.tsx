import { companyMetaBySlug } from "@/lib/client-meta";
import EstimateView, { type EstimateSearchParams } from "@/app/book/[slug]/estimate/EstimateView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug);
}

/** /embed/[slug]/estimate/[tool] — the estimate form inside an <iframe>. */
export default async function EmbedEstimatePage({ params, searchParams }: { params: Promise<{ slug: string; tool: string }>; searchParams: Promise<EstimateSearchParams> }) {
  const { slug, tool } = await params;
  return <EstimateView companySlug={slug} toolSlug={tool} searchParams={await searchParams} embed />;
}
