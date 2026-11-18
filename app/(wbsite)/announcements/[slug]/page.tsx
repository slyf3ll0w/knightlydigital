import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import { ANNOUNCEMENTS, ANNOUNCEMENTS_PATH, announcementDate, announcementPath, findAnnouncement } from "@/lib/wb-announcements";

const BASE = "https://workbenchfsm.com";
const ORANGE = "#F86A0A";

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

/* One release announcement. The words live in lib/wb-announcements.ts. */
export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = findAnnouncement(slug);
  if (!a) notFound();

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

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
          <Link href={ANNOUNCEMENTS_PATH} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            All announcements
          </Link>
          <p className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>
            {a.tag} · <time dateTime={a.date}>{announcementDate(a.date)}</time>
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] sm:text-5xl">{a.title}</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-gray-600">{a.summary}</p>
        </div>
      </section>

      <article className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-14">
          {a.blocks.map((b, i) => {
            if (b.type === "h") {
              return (
                <h2 key={i} className="mt-10 text-2xl font-extrabold text-gray-900 first:mt-0">
                  {b.text}
                </h2>
              );
            }
            if (b.type === "p") {
              return (
                <p key={i} className="mt-4 text-[16.5px] leading-relaxed text-gray-700 first:mt-0">
                  {b.text}
                </p>
              );
            }
            if (b.type === "steps") {
              return (
                <ol key={i} className="mt-5 space-y-3">
                  {b.items.map((s, n) => (
                    <li key={n} className="flex gap-3 text-[16.5px] leading-relaxed text-gray-700">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-bold text-[#0B57D8]">{n + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={i} className="mt-5 space-y-3.5">
                {b.items.map((item, n) => (
                  <li key={n} className="flex gap-3 text-[16.5px] leading-relaxed text-gray-700">
                    <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ORANGE }} aria-hidden />
                    <span>
                      {item.title && <strong className="font-bold text-gray-900">{item.title} </strong>}
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })}

          <Link
            href={`/help/${a.help.slug}`}
            className="group mt-12 flex items-center gap-4 rounded-2xl border border-gray-200 bg-[#F5F7FA] p-5 transition-shadow hover:shadow-md sm:p-6"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-gray-200">
              <BookOpen className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-gray-500">Step by step in the Help Center</span>
              <span className="block text-[16px] font-bold text-gray-900">{a.help.label}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
          </Link>
        </div>
      </article>

      <WBCta />
    </>
  );
}
