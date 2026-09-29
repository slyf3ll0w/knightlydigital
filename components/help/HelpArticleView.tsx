import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { helpNeighbors } from "@/lib/help/search";
import type { HelpArticle, HelpBlock, HelpSection } from "@/lib/help/types";
import Arrow from "@/components/ds/Arrow";
import HelpText from "./HelpText";
import HelpPageFrame from "./HelpPageFrame";

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
          <div className="help-card mt-5 divide-y divide-gray-200 overflow-hidden">
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
 * A block with a `note`: the site's hand-drawn note and arrow in their own
 * row, pointing down at the block (desktop only; never over the text).
 */
function NotedBlock({ block, base, delay }: { block: HelpBlock; base: string; delay: number }) {
  const note = "note" in block ? block.note : undefined;
  if (!note) return <Block block={block} base={base} />;
  return (
    <div>
      <div className="mb-1 hidden items-end gap-5 pl-1 lg:flex" aria-hidden>
        <p className="whitespace-nowrap pb-3 text-[15px] font-extrabold leading-snug text-[color:var(--hi)]">{note}</p>
        <span className="block h-[56px] w-[43px] flex-none text-[color:var(--hi)]">
          <Arrow variant="droop" delay={delay} className="h-full w-full" />
        </span>
      </div>
      <Block block={block} base={base} />
    </div>
  );
}

/** One Help Center guide, shared by /help/[slug] and /app/help/[slug]. */
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
  const { prev, next } = helpNeighbors(article.slug);

  const extras =
    article.where || article.plan || article.roles ? (
      <>
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
        {article.plan && <span className="help-chip">{article.plan}</span>}
        {article.roles && <span className="help-chip help-chip-quiet">{article.roles}</span>}
      </>
    ) : undefined;

  return (
    <HelpPageFrame
      base={base}
      inApp={inApp}
      section={section}
      title={article.title}
      summary={article.summary}
      extras={extras}
      sidebar={{ kind: "guides", current: article.slug }}
    >
      <article className="max-w-2xl">
        <div className="help-prose">
          {article.blocks.map((b, i) => (
            <NotedBlock key={i} block={b} base={base} delay={0.9} />
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {prev ? (
            <Link prefetch={false} href={`${base}/${prev.slug}`} className="help-card group hidden p-5 sm:block">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} /> Previous
              </span>
              <span className="mt-1 block text-[15.5px] font-bold text-gray-900 group-hover:text-[color:var(--hb-ink)]">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <Link prefetch={false} href={`${base}/${next.slug}`} className="help-card group block p-5 sm:text-right">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
                Next <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span className="mt-1 block text-[15.5px] font-bold text-gray-900 group-hover:text-[color:var(--hb-ink)]">
                {next.title}
              </span>
            </Link>
          )}
        </div>
      </article>
    </HelpPageFrame>
  );
}
