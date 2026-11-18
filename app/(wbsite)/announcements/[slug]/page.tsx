import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
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

/* One release announcement. The words live in lib/wb-announcements.ts; this
   template lays out any post the same way (header, article with its own
   table of contents, the Help guide, the next/previous post), so a new post
   needs no layout work. */
export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = findAnnouncement(slug);
  if (!a) notFound();

  const i = ANNOUNCEMENTS.indexOf(a);
  const newer = i > 0 ? ANNOUNCEMENTS[i - 1] : null;
  const older = i < ANNOUNCEMENTS.length - 1 ? ANNOUNCEMENTS[i + 1] : null;
  const headings = a.blocks.filter((b): b is Extract<AnnouncementBlock, { type: "h" }> => b.type === "h");
  const minutes = Math.max(1, Math.round(wordCount(a.blocks) / 220));

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
        <nav className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-500" aria-label="Breadcrumb">
          <Link href={ANNOUNCEMENTS_PATH} className="hover:text-gray-900">
            Announcements
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" strokeWidth={2.5} />
          <span className="truncate text-gray-700">{a.title}</span>
        </nav>
        <div className="mt-8 max-w-3xl">
          <p className="flex flex-wrap items-center gap-3">
            <span className="inline-block rounded-sm border border-[#0B57D8] px-2 py-0.5 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-[#0B57D8]">
              {a.tag}
            </span>
            <time dateTime={a.date} className="text-[14px] font-semibold text-gray-500">
              {announcementDate(a.date)}
            </time>
            <span className="text-[14px] text-gray-400" aria-hidden>
              ·
            </span>
            <span className="text-[14px] font-semibold text-gray-500">{minutes} min read</span>
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.06] text-gray-900 sm:text-[3.2rem]">{a.title}</h1>
          <span className="wb-bar" aria-hidden />
          <p className="mt-6 text-[18px] leading-relaxed text-gray-600 sm:text-[19px]">{a.summary}</p>
        </div>
      </WBHero>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-20">
          <article className="wb-prose min-w-0 max-w-[44rem]">
            {a.blocks.map((b, n) => {
              if (b.type === "h") {
                return (
                  <h2 key={n} id={anchor(b.text)} className="scroll-mt-28">
                    {b.text}
                  </h2>
                );
              }
              if (b.type === "p") return <p key={n}>{b.text}</p>;
              if (b.type === "steps") {
                return (
                  <ol key={n} className="!mt-6 border-t border-gray-200">
                    {b.items.map((s, k) => (
                      <li key={k} className="flex gap-4 border-b border-gray-200 py-4">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#0A1428] text-[14px] font-extrabold text-white">
                          {k + 1}
                        </span>
                        <span className="pt-0.5">{s}</span>
                      </li>
                    ))}
                  </ol>
                );
              }
              return (
                <ul key={n} className="!mt-6 space-y-5">
                  {b.items.map((item, k) => (
                    <li key={k} className="border-l-[3px] border-[#F86A0A] pl-5">
                      {item.title && <strong className="block text-[17.5px] font-extrabold">{item.title}</strong>}
                      <span className={item.title ? "mt-1 block" : ""}>{item.text}</span>
                    </li>
                  ))}
                </ul>
              );
            })}

            <Link
              href={`/help/${a.help.slug}`}
              className="group !mt-14 flex items-center gap-5 rounded-lg bg-[#0A1428] p-6 text-white no-underline sm:p-7"
            >
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-white/10">
                <BookOpen className="h-6 w-6 text-[#FF8B33]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#9DBBF7]">Step by step in the Help Center</span>
                <span className="mt-1 block text-[18px] font-extrabold leading-snug">{a.help.label}</span>
              </span>
              <ArrowRight className="h-5 w-5 flex-none text-[#FF8B33] transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
            </Link>
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-8">
              {headings.length > 0 && (
                <nav aria-label="On this page">
                  <p className="text-[12.5px] font-extrabold uppercase tracking-[0.12em] text-gray-500">On this page</p>
                  <ul className="mt-3 border-l-2 border-gray-200">
                    {headings.map((h) => (
                      <li key={h.text}>
                        <a href={`#${anchor(h.text)}`} className="-ml-[2px] block border-l-2 border-transparent py-1.5 pl-4 text-[14.5px] font-semibold text-gray-600 hover:border-[#0B57D8] hover:text-gray-900">
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="border-t-2 border-[#0A1428] pt-5">
                <p className="text-[16px] font-extrabold text-gray-900">Try it in your account</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">Already live. Log in and it is there.</p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <Link href="/app/login" className="wb-pill wb-pill-primary wb-pill-sm">
                    Log in
                  </Link>
                  <Link href="/apply" className="wb-pill wb-pill-outline wb-pill-sm">
                    Get started free
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Older / newer posts */}
      <section className="border-t border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-10 sm:grid-cols-2 sm:px-8">
          {older ? (
            <Link href={announcementPath(older)} className="group rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-400">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-500">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} /> Older
              </span>
              <span className="mt-1 block text-[16px] font-extrabold text-gray-900 group-hover:text-[#0B57D8]">{older.title}</span>
            </Link>
          ) : (
            <Link href={ANNOUNCEMENTS_PATH} className="group rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-400">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-500">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} /> Back to
              </span>
              <span className="mt-1 block text-[16px] font-extrabold text-gray-900 group-hover:text-[#0B57D8]">All announcements</span>
            </Link>
          )}
          {newer && (
            <Link href={announcementPath(newer)} className="group rounded-lg border border-gray-200 bg-white p-5 text-right hover:border-gray-400">
              <span className="flex items-center justify-end gap-1.5 text-[13px] font-bold text-gray-500">
                Newer <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span className="mt-1 block text-[16px] font-extrabold text-gray-900 group-hover:text-[#0B57D8]">{newer.title}</span>
            </Link>
          )}
        </div>
      </section>

      <WBCta />
    </>
  );
}
