import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { HELP_SECTIONS, POPULAR_SLUGS } from "@/lib/help/content";
import { findHelpArticle } from "@/lib/help/search";
import type { HelpBlock } from "@/lib/help/types";
import { HELP_ICONS } from "@/components/help/icons";
import HelpText from "@/components/help/HelpText";
import WBDoodle from "@/components/wb/WBDoodle";
import WBScribble from "@/components/wb/WBScribble";

/**
 * The public Help Center home below the search (workbenchfsm.com/help,
 * David 2026-11-19: "I feel like I'm just looking at words" and "the cards
 * are sometimes uneven"). The in-app /app/help keeps its own sections.
 *  - Topics: the first topic (Getting started) is a full-width navy "start
 *    here" card with its first guides; the rest sit in a grid whose last
 *    card stretches over any leftover columns, so no row is ragged at
 *    2 or 3 columns, whatever the number of topics.
 *  - Popular guides: real guide cards that preview each guide's first
 *    steps, the way the guide itself reads.
 */

export const HELP_CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.2rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.2rem]";

/** The last card's span so the final row is full at 2 (sm) and 3 (lg) columns. */
function lastSpan(n: number): string {
  const sm = n % 2 === 1 ? "sm:col-span-2" : "";
  const r = n % 3;
  const lg = r === 0 ? (sm ? "lg:col-span-1" : "") : r === 1 ? "lg:col-span-3" : "lg:col-span-2";
  return `${sm} ${lg}`.trim();
}

const guides = (n: number) => `${n} ${n === 1 ? "guide" : "guides"}`;

export default function WBHelpHomeSections({ base }: { base: string }) {
  const [first, ...rest] = HELP_SECTIONS;
  const FirstIcon = HELP_ICONS[first.icon];
  const popular = POPULAR_SLUGS.map((s) => findHelpArticle(s)).filter((a) => a !== null);
  // Popular cards at 2 / 3 columns: same rule as the topics.
  const popSpan = lastSpan(popular.length);
  const restSpan = lastSpan(rest.length);

  return (
    <>
      {/* ── Topics ─────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="relative">
            <h2 className={H2}>
              Pick a topic. <span className="text-[#0B57D8]">Follow the steps.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
              Every guide walks through the real screens, one step at a time, with fixes for the things that trip people up.
            </p>
            {/* Hand-drawn note in its own slot, pointing down at the start-here card */}
            <div className="pointer-events-none absolute -bottom-10 right-6 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                New here?
                <br />
                Start with these.
              </p>
              <WBScribble variant="droop" delay={0.6} className="h-[70px] w-[54px] flex-none" />
            </div>
          </div>

          {/* Start here: the first topic, navy, with its first guides */}
          <AnimateIn className="mt-12">
            <div className="grid grid-cols-1 overflow-hidden rounded-xl bg-[#0E1C3F] text-white shadow-[0_2px_0_rgba(10,20,40,0.12),0_30px_50px_-30px_rgba(10,20,40,0.6)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <Link prefetch={false} href={`${base}/topic/${first.id}`} className="group flex flex-col p-7 sm:p-9">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#F86A0A] text-white">
                  <FirstIcon className="h-7 w-7" strokeWidth={2} />
                </span>
                <h3 className="mt-6 text-[1.9rem] font-black leading-tight !text-white sm:text-[2.2rem]">{first.title}</h3>
                <p className="mt-3 max-w-sm text-[16.5px] leading-relaxed text-white/70">{first.tagline}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-7 text-[15px] font-bold text-[#FF8B33]">
                  All {guides(first.articles.length)}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                </span>
              </Link>
              <ol className="wb-stagger flex flex-col gap-2.5 bg-[#12234A] p-5 sm:p-7">
                {first.articles.slice(0, 4).map((a) => (
                  <li key={a.slug}>
                    <Link
                      prefetch={false}
                      href={`${base}/${a.slug}`}
                      className="group flex items-center gap-4 rounded-lg bg-white px-4 py-3.5 text-[#0A1428] transition-transform hover:-translate-y-0.5 sm:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-extrabold leading-snug">{a.title}</span>
                        <span className="mt-0.5 block truncate text-[13.5px] text-gray-500">{a.summary}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-[#F86A0A] transition-transform group-hover:translate-x-0.5" strokeWidth={2.75} />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </AnimateIn>

          {/* Every other topic */}
          <AnimateIn className="mt-5">
            <div className="wb-stagger grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {rest.map((s, i) => {
                const Icon = HELP_ICONS[s.icon];
                const span = i === rest.length - 1 ? restSpan : "";
                return (
                  <Link
                    key={s.id}
                    prefetch={false}
                    href={`${base}/topic/${s.id}`}
                    className={`${HELP_CARD} group flex items-center gap-4 px-4 py-3.5 sm:items-start transition-transform duration-200 hover:-translate-y-1 sm:p-6 ${span}`}
                  >
                    <span className="flex h-10 w-10 flex-none sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-[#0A1428] text-[#FF8B33] transition-colors duration-200 group-hover:bg-[#F86A0A] group-hover:text-white">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <h3 className="text-[18px] font-extrabold leading-snug">{s.title}</h3>
                        <span className="flex-none text-[13px] font-bold text-gray-400">{guides(s.articles.length)}</span>
                      </span>
                      <span className="mt-1.5 hidden text-[14.5px] sm:block leading-relaxed text-gray-600">{s.tagline}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Popular guides: previews of the real steps ───────────── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.07} className="right-8 top-10 w-[280px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <h2 className={`max-w-3xl ${H2}`}>
            The guides people <span className="text-[#F86A0A]">reach for first.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
            Getting paid, texting, calls, booking and bringing your clients over. Here is how each one starts.
          </p>
          <AnimateIn className="mt-12">
            <div className="wb-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map(({ article, section }, i) => {
                const Icon = HELP_ICONS[section.icon];
                const steps = article.blocks.find((b): b is Extract<HelpBlock, { type: "steps" }> => b.type === "steps");
                return (
                  <Link
                    key={article.slug}
                    prefetch={false}
                    href={`${base}/${article.slug}`}
                    className={`${HELP_CARD} group flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1 ${i === popular.length - 1 ? popSpan : ""}`}
                  >
                    <span className="flex items-center gap-2.5 text-[13.5px] font-bold text-gray-500">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0A1428] text-[#FF8B33]">
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                      {section.title}
                    </span>
                    <h3 className="mt-4 text-[20px] font-extrabold leading-snug group-hover:text-[#0B57D8]">{article.title}</h3>
                    {steps ? (
                      <ol className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                        {steps.items.slice(0, 3).map((s, k) => (
                          <li key={k} className="flex gap-3 text-[14px] leading-snug text-gray-600">
                            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#0A1428] text-[12px] font-extrabold text-white">
                              {k + 1}
                            </span>
                            <span className="line-clamp-2 pt-0.5">
                              {/* links flattened to text: the whole card is already a link */}
                              <HelpText text={s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")} base={base} />
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-[14.5px] leading-relaxed text-gray-600">{article.summary}</p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[14.5px] font-bold text-[#0B57D8]">
                      Read the guide
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
