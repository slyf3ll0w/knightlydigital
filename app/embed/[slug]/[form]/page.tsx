import EmbedView from "../EmbedView";
import { companyMetaBySlug } from "@/lib/client-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; form: string }>;
}) {
  const { slug } = await params;
  return companyMetaBySlug(slug);
}

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
