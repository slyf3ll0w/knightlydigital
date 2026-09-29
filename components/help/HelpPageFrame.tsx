import "./help.css";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/content";
import type { HelpSection } from "@/lib/help/types";
import { HELP_ICONS } from "./icons";
import HelpFooterBand from "./HelpFooterBand";

/**
 * The frame every Help Center page below the home shares: a short header
 * band on the site's bloom (breadcrumb, wiping title, summary, extras),
 * then a sidebar of topics/guides beside the content, then the navy band.
 * Phones drop the sidebar and keep a back link.
 */
export default function HelpPageFrame({
  base,
  inApp,
  section,
  title,
  summary,
  extras,
  sidebar,
  children,
}: {
  base: string;
  inApp: boolean;
  /** The topic the page belongs to (breadcrumb + back link). */
  section: HelpSection;
  title: string;
  summary: string;
  /** Below the summary: the "Open in app" button, plan/role chips. */
  extras?: React.ReactNode;
  /** "guides" = the topic's guides (article pages); "topics" = every topic (topic pages). */
  sidebar: { kind: "guides"; current: string } | { kind: "topics" };
  children: React.ReactNode;
}) {
  const Icon = HELP_ICONS[section.icon];
  const onTopicPage = sidebar.kind === "topics";

  return (
    <div className="ds help-root">
      <section className={`help-hero border-b border-gray-200 ${inApp ? "" : "-mt-20 sm:-mt-24"}`}>
        <div className={`mx-auto max-w-6xl px-5 pb-10 sm:px-8 sm:pb-12 ${inApp ? "pt-8 sm:pt-12" : "pt-[7rem] sm:pt-[8.5rem]"}`}>
          {/* Phone: one back link. Desktop: the breadcrumb. */}
          <Link
            prefetch={false}
            href={onTopicPage ? base : `${base}/topic/${section.id}`}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-[color:var(--hb-ink)] sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            {onTopicPage ? "Help Center" : section.title}
          </Link>
          <nav className="hidden items-center gap-1.5 text-[14px] font-semibold text-gray-500 sm:flex" aria-label="Breadcrumb">
            <Link prefetch={false} href={base} className="hover:text-gray-900">
              Help Center
            </Link>
            {!onTopicPage && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" strokeWidth={2.5} />
                <Link prefetch={false} href={`${base}/topic/${section.id}`} className="hover:text-gray-900">
                  {section.title}
                </Link>
              </>
            )}
          </nav>

          <div className="mt-5 flex items-start gap-4">
            {onTopicPage && (
              <span className="help-tile ds-rise mt-1 !h-12 !w-12">
                <Icon className="h-6 w-6" strokeWidth={2} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.1] sm:text-[2.5rem]">
                <span className="ds-wipe">
                  <span className="ds-wipe-text">{title}</span>
                  <span className="ds-wipe-bar" aria-hidden />
                </span>
              </h1>
              <p className="ds-rise mt-3 max-w-2xl text-[17px] leading-relaxed text-gray-600" style={{ "--ds-i": 1 } as React.CSSProperties}>
                {summary}
              </p>
            </div>
          </div>
          {extras && (
            <div className="ds-rise mt-6 flex flex-wrap items-center gap-2.5" style={{ "--ds-i": 2 } as React.CSSProperties}>
              {extras}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <aside className="hidden lg:block">
            <nav className="help-side sticky top-28" aria-label="Help Center">
              {sidebar.kind === "guides" ? (
                <>
                  <p className="mb-2 flex items-center gap-2.5 px-3 text-[14px] font-extrabold text-gray-900">
                    <span className="help-tile help-tile-sm">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    {section.title}
                  </p>
                  {section.articles.map((a) => (
                    <Link
                      key={a.slug}
                      prefetch={false}
                      href={`${base}/${a.slug}`}
                      aria-current={a.slug === sidebar.current ? "page" : undefined}
                    >
                      {a.title}
                    </Link>
                  ))}
                  <Link prefetch={false} href={base} className="!mt-5 !font-semibold !text-[color:var(--hb-ink)]">
                    All topics
                  </Link>
                </>
              ) : (
                <>
                  <p className="mb-2 px-3 text-[13px] font-bold text-gray-500">All topics</p>
                  {HELP_SECTIONS.map((s) => {
                    const SIcon = HELP_ICONS[s.icon];
                    return (
                      <Link
                        key={s.id}
                        prefetch={false}
                        href={`${base}/topic/${s.id}`}
                        aria-current={s.id === section.id ? "page" : undefined}
                        className="!flex items-center gap-2.5"
                      >
                        <SIcon className="h-4 w-4 flex-none opacity-70" strokeWidth={2} />
                        {s.title}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
          </aside>
          <div className="ds-rise min-w-0" style={{ "--ds-i": 3 } as React.CSSProperties}>
            {children}
          </div>
        </div>
      </section>

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
