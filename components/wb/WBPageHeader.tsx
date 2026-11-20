import Link from "next/link";
import { ChevronRight } from "lucide-react";
import WBHero from "@/components/wb/WBHero";

/**
 * The standard header band for any marketing page that is not built from a
 * page template (WBSplitHero for pages with a photo, WBFeaturePage,
 * WBComparePage, the Help Center, announcements). Job-sheet paper, an
 * optional breadcrumb, the small-caps label, the title with its bar, the
 * intro, then optional buttons and an optional right-hand column.
 *
 * New pages start here (see docs/site-design.md), so every page opens the
 * same way without copying markup.
 */
export default function WBPageHeader({
  label,
  title,
  intro,
  crumbs,
  actions,
  aside,
}: {
  label: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  /** Shown above the label: [{ label, href }] — the last one is the current page and is not linked. */
  crumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  /** A right-hand column on wide screens (a summary, a key fact, a link). */
  aside?: React.ReactNode;
}) {
  return (
    <WBHero>
      {crumbs && crumbs.length > 0 && (
        <nav className="mb-8 flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-white/60" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-white/35" strokeWidth={2.5} aria-hidden />}
              {c.href ? (
                <Link href={c.href} className="hover:text-white">
                  {c.label}
                </Link>
              ) : (
                <span className="text-white/85">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className={aside ? "grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-16" : ""}>
        <div className="max-w-3xl">
          <h1 className="mt-4 text-[2.6rem] font-black leading-[1.02] tracking-[-0.035em] sm:text-[3.6rem]">{title}</h1>
          {intro && <div className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">{intro}</div>}
          {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div>{aside}</div>}
      </div>
    </WBHero>
  );
}
