import EmbedView from "../EmbedView";

export default async function EmbedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; form: string }>;
  searchParams: Promise<{
    theme?: string;
    transparent?: string;
    accent?: string;
    font?: string;
    service?: string;
  }>;
}) {
  const { slug, form } = await params;
  return <EmbedView companySlug={slug} formSlug={form} searchParams={await searchParams} />;
}
