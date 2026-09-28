import "./help.css";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ExternalLink, Lightbulb, Plus, Sparkles, Users } from "lucide-react";
import { Button, Card, Chip } from "@/components/ds";
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
        <div className="help-callout help-callout-tip">
          <Lightbulb size={18} className="mt-0.5 flex-none" aria-hidden />
          <p>
            <span className="font-semibold">Good to know: </span>
            <HelpText text={block.text} base={base} />
          </p>
        </div>
      );
    case "warn":
      return (
        <div className="help-callout help-callout-warn">
          <AlertTriangle size={18} className="mt-0.5 flex-none" aria-hidden />
          <p>
            <span className="font-semibold">Heads up: </span>
            <HelpText text={block.text} base={base} />
          </p>
        </div>
      );
    case "faq":
      return (
        <div>
          <h2 className="!mt-8 mb-3">If something&apos;s not working</h2>
          <div className="help-faq">
            {block.items.map((f, i) => (
              <details key={i}>
                <summary>
                  <span>
                    <HelpText text={f.q} base={base} />
                  </span>
                  <Plus size={17} aria-hidden />
                </summary>
                <div className="help-faq-a">
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
 * One Help Center guide, shared by /help/[slug] and /app/help/[slug].
 * Desktop: a sticky side list of the feature's guides beside the article.
 * Phone: back link, the article, the next guide — nothing else.
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
    <div className="space-y-10">
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
        {/* ── Side list (desktop) ─────────────────────────── */}
        <aside className="hidden lg:block">
          <nav className="help-side sticky top-6 space-y-5" aria-label="Help Center">
            <Link
              prefetch={false}
              href={base}
              className="!inline-flex items-center gap-1.5 !px-0 font-medium !text-[color:var(--ds-muted)] hover:!bg-transparent hover:!text-[color:var(--ds-primary)]"
            >
              <ArrowLeft size={15} /> Help Center
            </Link>
            <div>
              <p className="mb-2 flex items-center gap-2 px-3 text-[12.5px] font-semibold text-[color:var(--ds-ink)]">
                <span className="help-tile help-tile-sm !h-6 !w-6 !rounded-[7px]">
                  <Icon size={13} strokeWidth={2.2} />
                </span>
                {section.title}
              </p>
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
            </div>
            <div>
              <p className="ds-label mb-1 px-3">Other features</p>
              {HELP_SECTIONS.filter((s) => s.id !== section.id).map((s) => (
                <Link key={s.id} prefetch={false} href={`${base}/${s.articles[0].slug}`}>
                  {s.title}
                </Link>
              ))}
            </div>
          </nav>
        </aside>

        {/* ── The article ─────────────────────────────────── */}
        <article className="ds-rise min-w-0 max-w-[720px]">
          <Link
            prefetch={false}
            href={base}
            className="mb-4 flex w-fit items-center gap-0.5 text-[15px] font-medium text-[color:var(--ds-primary)] lg:hidden"
          >
            <ChevronLeft size={19} /> Help
          </Link>
          <p className="help-label">{section.title}</p>
          <h1 className="ds-title mt-2 text-[26px] sm:text-[32px]">
            <span className="ds-wipe">
              <span className="ds-wipe-text">{article.title}</span>
              <span className="ds-wipe-bar" aria-hidden />
            </span>
          </h1>
          <p className="mt-3 text-[16.5px] leading-relaxed text-[color:var(--ds-ink-2)]">{article.summary}</p>

          {(article.plan || article.roles || article.where) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {article.where && (
                <Button href={article.where.href} size="sm" variant={inApp ? "primary" : "outline"} icon={inApp ? ArrowRight : ExternalLink}>
                  {inApp ? `Open ${article.where.label}` : `In the app: ${article.where.label}`}
                </Button>
              )}
              {article.plan && (
                <Chip tone="secondary" icon={Sparkles}>
                  {article.plan}
                </Chip>
              )}
              {article.roles && (
                <Chip tone="neutral" icon={Users}>
                  {article.roles}
                </Chip>
              )}
            </div>
          )}

          <div className="help-prose mt-8">
            {article.blocks.map((b, i) => (
              <Block key={i} block={b} base={base} />
            ))}
          </div>

          {/* ── Prev / next ───────────────────────────────── */}
          <div className="mt-12 grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Card href={`${base}/${prev.slug}`} className="ds-card-link hidden p-4 sm:block">
                <p className="ds-small flex items-center gap-1">
                  <ArrowLeft size={13} /> Previous
                </p>
                <p className="mt-1 text-[14.5px] font-medium text-[color:var(--ds-ink)]">{prev.title}</p>
              </Card>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <Card href={`${base}/${next.slug}`} className="ds-card-link p-4 sm:text-right">
                <p className="ds-small flex items-center gap-1 sm:justify-end">
                  Next <ArrowRight size={13} />
                </p>
                <p className="mt-1 text-[14.5px] font-medium text-[color:var(--ds-ink)]">{next.title}</p>
              </Card>
            )}
          </div>
        </article>
      </div>

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
