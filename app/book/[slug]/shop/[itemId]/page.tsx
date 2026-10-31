import Link from "next/link";
import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { loadStoreProduct } from "@/lib/store";
import { money } from "@/lib/statuses";
import { embedAccent } from "@/lib/embed-style";
import ScheduleFrame from "../../schedule/ScheduleFrame";
import BuyForm from "./BuyForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Shop");
}

/**
 * /book/[slug]/shop/[itemId] — one product's buy page: the picture, the
 * price, how many, who's buying, then straight to the pay page. This is
 * the link a business texts or puts on its website.
 */
export default async function ProductPage({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params;
  const loaded = await loadStoreProduct(slug, itemId);
  if (!loaded) notFound();
  const { company, appearance, product, taxRate } = loaded;
  const { dark, accent: savedAccent } = appearance;
  const muted = dark ? "text-gray-400" : "text-gray-500";

  return (
    <ScheduleFrame company={company} appearance={appearance} title={product.name} subtitle={money(product.unitPrice)} footer="slim">
      {product.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.photoUrl} alt={product.name} className="mb-4 max-h-80 w-full rounded-lg object-cover bg-gray-100" />
      )}
      {product.description && <p className={`mb-4 text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>{product.description}</p>}
      <BuyForm companySlug={slug} itemId={product.id} unitPrice={product.unitPrice} taxRate={taxRate} dark={dark} accent={embedAccent(savedAccent)} businessName={company.name} />
      <p className={`mt-6 text-center text-xs ${muted}`}>
        <Link href={`/book/${slug}/shop`} className="hover:underline">
          More from {company.name}
        </Link>
      </p>
    </ScheduleFrame>
  );
}
