import EmbedView from "./EmbedView";

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
