import { companyMetaBySlug } from "@/lib/client-meta";
import ItemView, { type ItemSearchParams } from "@/app/book/[slug]/ItemView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; form: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug);
}

/** /embed/[slug]/[item] — one item inside an <iframe>. */
export default async function EmbedItemPage({ params, searchParams }: { params: Promise<{ slug: string; form: string }>; searchParams: Promise<ItemSearchParams> }) {
  const { slug, form } = await params;
  return <ItemView companySlug={slug} itemSlug={form} searchParams={await searchParams} embed />;
}
