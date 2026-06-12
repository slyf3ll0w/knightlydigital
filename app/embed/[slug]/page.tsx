import EmbedView from "./EmbedView";
import { companyMetaBySlug } from "@/lib/client-meta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug);
}

export default async function EmbedBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    theme?: string;
    transparent?: string;
    accent?: string;
    font?: string;
    service?: string;
  }>;
}) {
  const { slug } = await params;
  return <EmbedView companySlug={slug} searchParams={await searchParams} />;
}
