import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import WBArticleBlocks, { articleAnchor } from "@/components/wb/WBArticleBlocks";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import { findHelpArticle } from "@/lib/help/search";
import { getSuperadmin } from "@/lib/superadmin";
import { findPost, neighborPosts, type PublicPost } from "@/lib/blog";
import { BLOG_PATH, blogDate, blogPostPath, blocksWordCount } from "@/lib/blog-shared";

export const dynamic = "force-dynamic";

const BASE = "https://workbenchfsm.com";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

/** A queued or held post opens only for a superadmin with ?preview=1 (Console → Blog → Preview). */
async function load(props: Props) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const preview = sp.preview === "1" && (await getSuperadmin()) !== null;
  return findPost(slug, preview);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  if (!p) return {};
  return {
    title: p.title,
    description: p.summary,
    alternates: { canonical: `${BASE}${blogPostPath(p)}` },
    openGraph: { type: "article", title: p.title, description: p.summary, publishedTime: p.publishedAt.toISOString() },
    ...(p.status !== "PUBLISHED" ? { robots: { index: false, follow: false } } : {}),
  };
}

const CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

/* One blog post. The words live in the BlogPost table (lib/blog.ts); this
   template lays out any post the same way as an announcement: header,
   article with its own table of contents, the Help guide it points to, the
   older / newer post. */
export default async function BlogPostPage(props: Props) {
  const p = await load(props);
  if (!p) notFound();

  const live = p.status === "PUBLISHED";
  const { older, newer } = live ? await neighborPosts(p.publishedAt) : { older: null, newer: null };
  const headings = p.blocks.filter((b): b is Extract<typeof b, { type: "h" }> => b.type === "h");
  const minutes = Math.max(1, Math.round(blocksWordCount(p.blocks) / 220));
  const guide = p.helpSlug ? findHelpArticle(p.helpSlug) : null;
  const pager = [older ? { p: older, dir: "Older" as const } : null, newer ? { p: newer, dir: "Newer" as const } : null].filter(
    (x): x is { p: PublicPost; dir: "Older" | "Newer" } => x !== null,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.summary,
    datePublished: p.publishedAt.toISOString(),
    dateModified: p.updatedAt.toISOString(),
    mainEntityOfPage: `${BASE}${blogPostPath(p)}`,
    author: { "@type": "Organization", name: "WorkBench FSM", url: BASE },
    publisher: { "@type": "Organization", name: "WorkBench FSM", url: BASE },
  };

  return (
    <>
      {live && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <WBHero>
        {!live && (
          <p className="mb-6 rounded-lg bg-[#F86A0A] px-4 py-2.5 text-[14px] font-bold text-white">
            Preview: this post is {p.status === "QUEUED" ? "waiting in the queue" : p.status === "HELD" ? "held for review" : "pulled"} and is not on the site.
          </p>
        )}
        <nav className="flex items-center gap-1.5 text-[14px] font-semibold text-white/60" aria-label="Breadcrumb">
          <Link href={BLOG_PATH} className="hover:text-white">
            Blog
          </Link>
          <ChevronRight className="h-3.5 w-3.5 flex-none text-white/35" strokeWidth={2.5} />
          <span className="truncate text-white/85">{p.title}</span>
        </nav>
        <div className="mt-8 max-w-4xl">
          <p className="text-[15px] font-semibold text-gray-500">
            {live && <time dateTime={p.publishedAt.toISOString()}>{blogDate(p.publishedAt)}</time>}
            {live && (
              <span className="mx-2 opacity-50" aria-hidden>
                ·
              </span>
            )}
            <span className="text-[#FF8B33]">{p.tag}</span>
            <span className="mx-2 opacity-50" aria-hidden>
              ·
            </span>
            {minutes} min read
          </p>
          <h1 className="mt-5 text-[2.6rem] leading-[1.02] tracking-[-0.04em] sm:text-[4rem]">{p.title}</h1>
          <p className="mt-6 max-w-3xl text-[18px] leading-relaxed text-gray-600 sm:text-[20px]">{p.summary}</p>
        </div>
      </WBHero>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-20">
          <article className="wb-prose min-w-0 max-w-[44rem]">
            <WBArticleBlocks blocks={p.blocks} />

            {guide && (
              <Link
                href={`/help/${guide.article.slug}`}
                className={`${CARD} group !mt-14 flex items-center gap-5 p-6 no-underline transition-transform duration-200 hover:-translate-y-1 sm:p-7`}
              >
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                  <BookOpen className="h-7 w-7 text-[#FF8B33]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-gray-500">Doing this in WorkBench</span>
                  <span className="mt-0.5 block text-[19px] font-extrabold leading-snug text-[#0A1428] group-hover:text-[#0B57D8]">{guide.article.title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-gray-600">{guide.article.summary}</span>
                </span>
                <ArrowRight className="h-5 w-5 flex-none text-[#F86A0A] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
              </Link>
            )}
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-6">
              {headings.length > 0 && (
                <nav aria-label="On this page">
                  <p className="text-[15px] font-extrabold text-[#0A1428]">On this page</p>
                  <ul className="mt-3 border-l-2 border-gray-200">
                    {headings.map((h) => (
                      <li key={h.text}>
                        <a
                          href={`#${articleAnchor(h.text)}`}
                          className="-ml-[2px] block border-l-2 border-transparent py-1.5 pl-4 text-[14.5px] font-semibold text-gray-600 hover:border-[#F86A0A] hover:text-gray-900"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className={`${CARD} p-6`}>
                <p className="text-[17px] font-extrabold text-[#0A1428]">Run it all in one place</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">Quotes, scheduling, invoices and payments. Free, not a trial.</p>
                <div className="mt-5 flex flex-col gap-2.5">
                  <Link href="/apply" className="wb-pill wb-pill-orange wb-pill-sm">
                    Get started free
                  </Link>
                  <Link href="/features" className="wb-pill wb-pill-dark wb-pill-sm">
                    See the features
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-[#F5F7FA]">
        <div className={`mx-auto grid max-w-6xl gap-5 px-5 py-14 sm:px-8 ${pager.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {pager.length === 0 ? (
            <Link href={BLOG_PATH} className={`${CARD} group flex items-center justify-between gap-4 p-6`}>
              <span>
                <span className="block text-[14px] font-semibold text-gray-500">Back to</span>
                <span className="mt-0.5 block text-[18px] font-extrabold text-[#0A1428] group-hover:text-[#0B57D8]">All posts</span>
              </span>
              <ArrowLeft className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.5} />
            </Link>
          ) : (
            pager.map(({ p: n, dir }) => (
              <Link key={n.slug} href={blogPostPath(n)} className={`${CARD} group block p-6 ${dir === "Newer" ? "sm:text-right" : ""}`}>
                <span className={`flex items-center gap-1.5 text-[14px] font-semibold text-gray-500 ${dir === "Newer" ? "sm:justify-end" : ""}`}>
                  {dir === "Older" && <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {dir} · {blogDate(n.publishedAt)}
                  {dir === "Newer" && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />}
                </span>
                <span className="mt-1 block text-[18px] font-extrabold text-[#0A1428] group-hover:text-[#0B57D8]">{n.title}</span>
              </Link>
            ))
          )}
        </div>
      </section>

      <WBCta />
    </>
  );
}
