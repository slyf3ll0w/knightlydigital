import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpArticleView from "@/components/help/HelpArticleView";
import { findHelpArticle } from "@/lib/help/search";
import { requirePageActor } from "@/lib/permissions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = findHelpArticle((await params).slug);
  return { title: found ? `${found.article.title} · Help` : "Help Center" };
}

export default async function AppHelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePageActor();
  const found = findHelpArticle((await params).slug);
  if (!found) notFound();
  return (
    <HelpArticleView article={found.article} section={found.section} base="/app/help" inApp />
  );
}
