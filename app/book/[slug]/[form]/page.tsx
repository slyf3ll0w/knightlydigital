import { companyMetaBySlug } from "@/lib/client-meta";
import ItemView, { type ItemSearchParams } from "../ItemView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; form: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book online");
}

/** /book/[slug]/[item] — one item's page (the segment is still named `form` from the web-form days). */
export default async function BookingItemPage({ params, searchParams }: { params: Promise<{ slug: string; form: string }>; searchParams: Promise<ItemSearchParams> }) {
  const { slug, form } = await params;
  return <ItemView companySlug={slug} itemSlug={form} searchParams={await searchParams} />;
}
