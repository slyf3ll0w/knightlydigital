import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBAnnounceVisual from "@/components/wb/WBAnnounceVisual";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import { findHelpArticle } from "@/lib/help/search";
import { ANNOUNCEMENTS, ANNOUNCEMENTS_PATH, announcementDate, announcementPath, findAnnouncement, type AnnouncementBlock } from "@/lib/wb-announcements";

const BASE = "https://workbenchfsm.com";

export function generateStaticParams() {
  return ANNOUNCEMENTS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = findAnnouncement(slug);
  if (!a) return {};
  return {
    title: a.title,
    description: a.summary,
    alternates: { canonical: `${BASE}${announcementPath(a)}` },
    openGraph: { type: "article", title: a.title, description: a.summary, publishedTime: a.date },
  };
}

const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function wordCount(blocks: AnnouncementBlock[]): number {
  const text = blocks
    .map((b) => (b.type === "p" || b.type === "h" ? b.text : b.type === "steps" ? b.items.join(" ") : b.items.map((i) => `${i.title ?? ""} ${i.text}`).join(" ")))
    .join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

const CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

/* One release announcement. The words live in lib/wb-announcements.ts; this
   template lays out any post the same way (header, article with its own
   table of contents, the Help guide, the next/previous post), so a new post
   needs no layout work. Restyled 2026-11-19 (David: "looks super
   AI-generated"): solid cards, no small-caps labels, and the screen the
   post is about (WBAnnounceVisual) after the opening paragraph. */
export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = findAnnouncement(slug);
  if (!a) notFound();

  const i = ANNOUNCEMENTS.indexOf(a);
  const newer = i > 0 ? ANNOUNCEMENTS[i - 1] : null;
  const older = i < ANNOUNCEMENTS.length - 1 ? ANNOUNCEMENTS[i + 1] : null;
  const headings = a.blocks.filter((b): b is Extract<AnnouncementBlock, { type: "h" }> => b.type === "h");
  const minutes = Math.max(1, Math.round(wordCount(a.blocks) / 220));
  const guide = findHelpArticle(a.help.slug);
  const pager = [older ? { a: older, dir: "Older" as const } : null, newer ? { a: newer, dir: "Newer" as const } : null].filter(
    (x): x is { a: typeof ANNOUNCEMENTS[number]; dir: "Older" | "Newer" } => x !== null,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.summary,
    datePublished: a.date,
    dateModified: a.date,
    mainEntityOfPage: `${BASE}${announcementPath(a)}`,
    author: { "@type": "Organization", name: "WorkBench FSM", url: BASE },
    publisher: { "@type": "Organization", name: "WorkBench FSM", url: BASE },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <WBHero>
        <nav className="flex items-center gap-1.5 text-[14px] font-semibold text-white/60" aria-label="Breadcrumb">
          <Link href={ANNOUNCEMENTS_PATH} className="hover:text-white">
            Announcements
          </Link>
          <ChevronRight className="h-3.5 w-3.5 flex-none text-white/35" strokeWidth={2.5} />
          <span className="truncate text-white/85">{a.title}</span>
        </nav>
        <div className="mt-8 max-w-4xl">
          <p className="text-[15px] font-semibold text-gray-500">
            <time dateTime={a.date}>{announcementDate(a.date)}</time>
            <span className="mx-2 opacity-50" aria-hidden>
              ·
            </span>
            <span className="text-[#FF8B33]">{a.tag}</span>
            <span className="mx-2 opacity-50" aria-hidden>
              ·
            </span>
            {minutes} min read
          </p>
          <h1 className="mt-5 text-[2.6rem] leading-[1.02] tracking-[-0.04em] sm:text-[4rem]">{a.title}</h1>
          <p className="mt-6 max-w-3xl text-[18px] leading-relaxed text-gray-600 sm:text-[20px]">{a.summary}</p>
        </div>
      </WBHero>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-20">
          <article className="wb-prose min-w-0 max-w-[44rem]">
            {a.blocks.map((b, n) => {
              let el: React.ReactNode;
              if (b.type === "h") {
                el = (
                  <h2 id={anchor(b.text)} className="scroll-mt-28 !text-[1.9rem] !font-black !tracking-[-0.02em]">
                    {b.text}
                  </h2>
                );
              } else if (b.type === "p") {
                el = <p>{b.text}</p>;
              } else if (b.type === "steps") {
                el = (
                  <ol className={`${CARD} !mt-6 overflow-hidden`}>
                    {b.items.map((s, k) => (
                      <li key={k} className="flex gap-4 border-t border-gray-100 px-5 py-4 first:border-t-0 sm:px-6">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#0A1428] text-[14px] font-extrabold text-white">
                          {k + 1}
                        </span>
                        <span className="pt-0.5">{s}</span>
                      </li>
                    ))}
                  </ol>
                );
              } else if (b.items.every((i) => i.title)) {
                // Titled points: one solid card each, stacked
                el = (
                  <ul className="!mt-6 space-y-4">
                    {b.items.map((item, k) => (
                      <li key={k} className={`${CARD} p-5 sm:p-6`}>
                        <strong className="block text-[18px] font-extrabold leading-snug">{item.title}</strong>
                        <span className="mt-1.5 block text-[16px] leading-relaxed">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                );
              } else {
                el = (
                  <ul className="!mt-5 space-y-3">
                    {b.items.map((item, k) => (
                      <li key={k} className="flex gap-3.5">
                        <span className="mt-[0.8em] h-[3px] w-3.5 flex-none rounded-full bg-[#F86A0A]" aria-hidden />
                        <span>
                          {item.title && <strong>{item.title} </strong>}
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <Fragment key={n}>
                  {el}
                  {/* The screen the post is about, after the opening paragraph */}
                  {n === 0 && (
                    <AnimateIn className="!mt-10 !mb-4">
                      <WBAnnounceVisual announcement={a} />
                    </AnimateIn>
                  )}
                </Fragment>
              );
            })}

            <Link href={`/help/${a.help.slug}`} className={`${CARD} group !mt-14 flex items-center gap-5 p-6 no-underline transition-transform duration-200 hover:-translate-y-1 sm:p-7`}>
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                <BookOpen className="h-7 w-7 text-[#FF8B33]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-gray-500">The step-by-step guide</span>
                <span className="mt-0.5 block text-[19px] font-extrabold leading-snug text-[#0A1428] group-hover:text-[#0B57D8]">{a.help.label}</span>
                {guide && <span className="mt-1 block text-[15px] leading-relaxed text-gray-600">{guide.article.summary}</span>}
              </span>
              <ArrowRight className="h-5 w-5 flex-none text-[#F86A0A] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
            </Link>
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-6">
              {headings.length > 0 && (
                <nav aria-label="On this page">
                  <p className="text-[15px] font-extrabold text-[#0A1428]">On this page</p>
                  <ul className="mt-3 border-l-2 border-gray-200">
                    {headings.map((h) => (
                      <li key={h.text}>
                        <a href={`#${anchor(h.text)}`} className="-ml-[2px] block border-l-2 border-transparent py-1.5 pl-4 text-[14.5px] font-semibold text-gray-600 hover:border-[#F86A0A] hover:text-gray-900">
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className={`${CARD} p-6`}>
                <p className="text-[17px] font-extrabold text-[#0A1428]">Try it in your account</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">Already live. Log in and it is there.</p>
                <div className="mt-5 flex flex-col gap-2.5">
                  <Link href="/app/login" className="wb-pill wb-pill-dark wb-pill-sm">
                    Log in
                  </Link>
                  <Link href="/apply" className="wb-pill wb-pill-orange wb-pill-sm">
                    Get started free
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Older / newer posts, or the way back to the list */}
      <section className="bg-[#F5F7FA]">
        <div className={`mx-auto grid max-w-6xl gap-5 px-5 py-14 sm:px-8 ${pager.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {pager.length === 0 ? (
            <Link href={ANNOUNCEMENTS_PATH} className={`${CARD} group flex items-center justify-between gap-4 p-6`}>
              <span>
                <span className="block text-[14px] font-semibold text-gray-500">Back to</span>
                <span className="mt-0.5 block text-[18px] font-extrabold text-[#0A1428] group-hover:text-[#0B57D8]">All announcements</span>
              </span>
              <ArrowLeft className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.5} />
            </Link>
          ) : (
            pager.map(({ a: p, dir }) => (
              <Link key={p.slug} href={announcementPath(p)} className={`${CARD} group block p-6 ${dir === "Newer" ? "sm:text-right" : ""}`}>
                <span className={`flex items-center gap-1.5 text-[14px] font-semibold text-gray-500 ${dir === "Newer" ? "sm:justify-end" : ""}`}>
                  {dir === "Older" && <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {dir} · {announcementDate(p.date)}
                  {dir === "Newer" && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />}
                </span>
                <span className="mt-1 block text-[18px] font-extrabold text-[#0A1428] group-hover:text-[#0B57D8]">{p.title}</span>
              </Link>
            ))
          )}
        </div>
      </section>

      <WBCta />
    </>
  );
}
