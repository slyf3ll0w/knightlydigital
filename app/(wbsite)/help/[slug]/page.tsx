import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpArticleView from "@/components/help/HelpArticleView";
import { HELP_SECTIONS, findHelpArticle, plainText } from "@/lib/help/search";

export function generateStaticParams() {
  return HELP_SECTIONS.flatMap((s) => s.articles.map((a) => ({ slug: a.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = findHelpArticle((await params).slug);
  if (!found) return { title: "Help Center" };
  return {
    title: `${found.article.title} · Help`,
    description: found.article.summary,
    alternates: { canonical: `https://workbenchfsm.com/help/${found.article.slug}` },
  };
}

export default async function PublicHelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const found = findHelpArticle((await params).slug);
  if (!found) notFound();
  const { article, section } = found;

  // Breadcrumbs + the troubleshooting Q&A as structured data, for search
  // engines and AI answer engines.
  const faq = article.blocks.flatMap((b) => (b.type === "faq" ? b.items : []));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Help Center", item: "https://workbenchfsm.com/help" },
        { "@type": "ListItem", position: 2, name: section.title },
        { "@type": "ListItem", position: 3, name: article.title, item: `https://workbenchfsm.com/help/${article.slug}` },
      ],
    },
    ...(faq.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: plainText(f.q),
              acceptedAnswer: { "@type": "Answer", text: plainText(f.a) },
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }}
      />
      <HelpArticleView article={article} section={section} base="/help" inApp={false} />
    </>
  );
}
