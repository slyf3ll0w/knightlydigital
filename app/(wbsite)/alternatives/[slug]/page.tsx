import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WBAlternativePage from "@/components/wb/WBAlternativePage";
import { ALTERNATIVES, ALTERNATIVES_PATH, alternativeBySlug } from "@/lib/wb-alternatives";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALTERNATIVES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const alt = alternativeBySlug(slug);
  if (!alt) return {};
  return {
    title: alt.savingsId ? `Free ${alt.name} alternative` : `${alt.name} alternative for small shops`,
    description: alt.description,
    alternates: { canonical: `https://workbenchfsm.com${ALTERNATIVES_PATH}/${alt.slug}` },
  };
}

export default async function AlternativePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const alt = alternativeBySlug(slug);
  if (!alt) notFound();
  return <WBAlternativePage alt={alt} />;
}
