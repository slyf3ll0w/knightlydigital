import "./help.css";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/content";
import { helpNeighbors } from "@/lib/help/search";
import type { HelpArticle, HelpBlock, HelpSection } from "@/lib/help/types";
import { HELP_ICONS } from "./icons";
import HelpText from "./HelpText";
import HelpFooterBand from "./HelpFooterBand";

function Block({ block, base }: { block: HelpBlock; base: string }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <HelpText text={block.text} base={base} />
        </p>
      );
    case "h":
      return (
        <h2>
          <HelpText text={block.text} base={base} />
        </h2>
      );
    case "steps":
      return (
        <ol className="help-steps">
          {block.items.map((s, i) => (
            <li key={i}>
              <HelpText text={s} base={base} />
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="help-bullets">
          {block.items.map((s, i) => (
            <li key={i}>
              <HelpText text={s} base={base} />
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <aside className="help-note help-note-tip">
          <span className="help-note-title">Good to know</span>
          <HelpText text={block.text} base={base} />
        </aside>
      );
    case "warn":
      return (
        <aside className="help-note help-note-warn">
          <span className="help-note-title">Heads up</span>
          <HelpText text={block.text} base={base} />
        </aside>
      );
    case "faq":
      return (
        <div className="!mt-12">
          <h2 className="!mt-0">If something&apos;s not working</h2>
          <div className="mt-5 divide-y divide-gray-200 overflow-hidden rounded-[1.25rem] border border-gray-200 bg-white">
            {block.items.map((f, i) => (
              <details key={i} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15.5px] font-bold leading-snug text-gray-900 transition-colors hover:bg-[#F6F8FB] sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                  <span>
                    <HelpText text={f.q} base={base} />
                  </span>
                  <ChevronDown
                    className="h-4 w-4 flex-none text-gray-400 transition-transform duration-200 group-open:rotate-180"
                    strokeWidth={2.5}
                  />
                </summary>
                <div className="px-5 pb-5 text-[15px] leading-relaxed text-gray-600 sm:px-6 sm:pb-6">
                  <HelpText text={f.a} base={base} />
                </div>
              </details>
            ))}
          </div>
        </div>
      );
  }
}

/**
 * One Help Center guide, shared by /help/[slug] and /app/help/[slug], laid
 * out like a marketing-site page: bloom header band, then the article on
 * white with the topic's other guides in a plain side list (desktop).
 */
export default function HelpArticleView({
  article,
  section,
  base,
  inApp,
}: {
  article: HelpArticle;
  section: HelpSection;
  base: string;
  inApp: boolean;
}) {
  const Icon = HELP_ICONS[section.icon];
  const { prev, next } = helpNeighbors(article.slug);

  return (
    <div className="help-root">
      {/* ── Header band ─────────────────────────────────────── */}
      <section className={`help-hero border-b border-gray-200 ${inApp ? "" : "-mt-20 sm:-mt-24"}`}>
        <div
          className={`mx-auto max-w-6xl px-5 pb-10 sm:px-8 sm:pb-12 ${inApp ? "pt-8 sm:pt-12" : "pt-[7rem] sm:pt-[8.5rem]"}`}
        >
          <nav className="flex flex-wrap items-center gap-1 text-[13.5px] font-semibold text-gray-500" aria-label="Breadcrumb">
            <Link prefetch={false} href={base} className="inline-flex items-center gap-0.5 hover:text-gray-900">
              <ChevronLeft className="h-4 w-4 sm:hidden" strokeWidth={2.5} />
              Help Center
            </Link>
            <ChevronRight className="hidden h-3.5 w-3.5 text-gray-300 sm:block" strokeWidth={2.5} />
            <span className="hidden items-center gap-1.5 text-gray-700 sm:inline-flex">
              <Icon className="h-4 w-4 text-[color:var(--ho)]" strokeWidth={2} />
              {section.title}
            </span>
          </nav>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
            <span className="ds-wipe">
              <span className="ds-wipe-text">{article.title}</span>
              <span className="ds-wipe-bar" aria-hidden />
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-gray-600">{article.summary}</p>

          {(article.where || article.plan || article.roles) && (
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {article.where && (
                <Link
                  prefetch={false}
                  href={article.where.href}
                  className={`help-pill ${inApp ? "help-pill-blue" : "help-pill-outline"} !py-2.5 !text-[14px]`}
                >
                  {inApp ? `Open ${article.where.label}` : `In the app: ${article.where.label}`}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              )}
              {article.plan && <span className="help-chip help-chip-orange">{article.plan}</span>}
              {article.roles && <span className="help-chip help-chip-blue">{article.roles}</span>}
            </div>
          )}
        </div>
      </section>

      {/* ── The guide ───────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav className="help-side sticky top-28" aria-label={`${section.title} guides`}>
              <p className="help-label mb-2">{section.title}</p>
              {section.articles.map((a) => (
                <Link
                  key={a.slug}
                  prefetch={false}
                  href={`${base}/${a.slug}`}
                  aria-current={a.slug === article.slug ? "page" : undefined}
                >
                  {a.title}
                </Link>
              ))}
              <p className="help-label mb-2 mt-8">Other topics</p>
              {HELP_SECTIONS.filter((s) => s.id !== section.id).map((s) => (
                <Link key={s.id} prefetch={false} href={`${base}/${s.articles[0].slug}`}>
                  {s.title}
                </Link>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 max-w-2xl">
            <div className="help-prose">
              {article.blocks.map((b, i) => (
                <Block key={i} block={b} base={base} />
              ))}
            </div>

            <div className="mt-14 grid gap-6 border-t border-gray-200 pt-8 sm:grid-cols-2">
              {prev ? (
                <Link prefetch={false} href={`${base}/${prev.slug}`} className="group hidden sm:block">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} /> Previous
                  </span>
                  <span className="mt-1 block text-[16px] font-bold text-gray-900 group-hover:text-[color:var(--hb)]">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Link prefetch={false} href={`${base}/${next.slug}`} className="group block sm:text-right">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
                    Next <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  <span className="mt-1 block text-[16px] font-bold text-gray-900 group-hover:text-[color:var(--hb)]">
                    {next.title}
                  </span>
                </Link>
              )}
            </div>
          </article>
        </div>
      </section>

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
