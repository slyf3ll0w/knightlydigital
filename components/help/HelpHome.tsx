"use client";

import "./help.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";
import { HELP_SECTIONS, POPULAR_SLUGS, START_HERE_SLUGS } from "@/lib/help/content";
import { findHelpArticle, helpArticleCount, searchHelp } from "@/lib/help/search";
import { WB_DAY_PHOTOS } from "@/lib/wb-site";
import { HELP_ICONS } from "./icons";
import HelpFooterBand from "./HelpFooterBand";

/** Wrap each query word found in `text` in a highlight. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="help-mark">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Help Center home — the public /help and the in-app /app/help. Built like
 * a page of the marketing site: bloom hero with a job-site photo, flat
 * "start here" and topic sections on white and #F6F8FB bands, the navy
 * band last. Phones get the same hero, then one list of topics that open
 * in place.
 */
export default function HelpHome({
  base,
  inApp,
  initialQuery = "",
}: {
  /** "/help" (public) or "/app/help" (in the app). */
  base: string;
  inApp: boolean;
  initialQuery?: string;
}) {
  const atlas = useAssistant();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchHelp(query, 12), [query]);
  const searching = query.trim().length > 0;
  const total = helpArticleCount();

  // "/" jumps to search (desktop habit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep ?q= in the address bar so a search can be shared or linked.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [query]);

  const popular = POPULAR_SLUGS.map((s) => findHelpArticle(s)?.article).filter((a) => a !== undefined);
  const startHere = START_HERE_SLUGS.map((s) => findHelpArticle(s)).filter((a) => a !== null);

  return (
    <div className="help-root">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className={`help-hero border-b border-gray-200 ${inApp ? "" : "-mt-20 sm:-mt-24"}`}>
        <div
          className={`mx-auto grid max-w-6xl items-center gap-12 px-5 pb-12 sm:px-8 sm:pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 ${
            inApp ? "pt-10 sm:pt-14" : "pt-[7.5rem] sm:pt-[9.5rem]"
          }`}
        >
          <div className="min-w-0">
            <p className="help-label">Help Center</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              <span className="ds-wipe">
                <span className="ds-wipe-text">How can we help?</span>
                <span className="ds-wipe-bar" aria-hidden />
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-gray-600">
              {total} step-by-step guides to every part of WorkBench, with fixes for the things that trip people up.
            </p>

            <form
              className="help-search mt-7 max-w-xl"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                inputRef.current?.blur();
              }}
            >
              <Search className="h-5 w-5 flex-none text-gray-400" strokeWidth={2.2} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder="Search the guides"
                aria-label="Search the Help Center"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Clear search"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </button>
              )}
              <button type="submit" className="help-pill help-pill-blue hidden sm:inline-flex">
                Search
              </button>
            </form>

            {!searching && (
              <div className="mt-5 flex flex-wrap gap-2">
                {popular.map((a, i) => (
                  <Link
                    key={a.slug}
                    prefetch={false}
                    href={`${base}/${a.slug}`}
                    className={`help-chip ${i % 2 ? "help-chip-orange" : "help-chip-blue"}`}
                  >
                    {a.title}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* A real job-site photo with two floating notes, like the site's heroes. */}
          <div className="relative mx-auto hidden w-full max-w-md lg:block lg:max-w-none" aria-hidden>
            <div className="relative aspect-[4/5] max-h-[440px] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_70px_rgba(10,20,40,0.22)]">
              <Image
                src={WB_DAY_PHOTOS.paid.src}
                alt=""
                fill
                sizes="(min-width: 1024px) 480px, 90vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            </div>
            <div
              className="help-float absolute -left-8 bottom-10 flex max-w-[270px] items-start gap-3 rounded-2xl bg-white py-3 pl-3 pr-4"
              style={{ animationDelay: "-2.2s" }}
            >
              <AtlasMark size={34} accent={atlas.accent} className="flex-none rounded-[10px]" />
              <span>
                <span className="block text-[13.5px] font-bold text-gray-900">&ldquo;How do I refund a payment?&rdquo;</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">Atlas answers from these guides</span>
              </span>
            </div>
            <div className="help-float absolute -right-4 top-8 rounded-2xl bg-white px-4 py-2.5">
              <span className="block text-[20px] font-extrabold leading-none text-gray-900">{total}</span>
              <span className="mt-1 block text-[12px] text-gray-500">guides, updated with the app</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Search results ─────────────────────────────────── */}
      {searching && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <p className="text-[14px] font-semibold text-gray-500">
              {hits.length === 0
                ? "No guides match that yet. Try fewer words, or the name of the screen you're on."
                : `${hits.length} ${hits.length === 1 ? "guide" : "guides"} for “${query.trim()}”`}
            </p>
            {hits.length > 0 && (
              <ul className="mt-5 divide-y divide-gray-200 overflow-hidden rounded-[1.25rem] border border-gray-200 bg-white">
                {hits.map(({ article, section }) => {
                  const Icon = HELP_ICONS[section.icon];
                  return (
                    <li key={article.slug}>
                      <Link
                        prefetch={false}
                        href={`${base}/${article.slug}`}
                        className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#F6F8FB] sm:px-6"
                      >
                        <Icon className="mt-0.5 h-5 w-5 flex-none text-[color:var(--ho)]" strokeWidth={1.9} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15.5px] font-bold text-gray-900">
                            <Highlight text={article.title} query={query} />
                          </span>
                          <span className="mt-0.5 block text-[14px] leading-relaxed text-gray-600">
                            <span className="font-semibold text-gray-500">{section.title}</span> ·{" "}
                            <Highlight text={article.summary} query={query} />
                          </span>
                        </span>
                        <ArrowRight className="mt-1 hidden h-4 w-4 flex-none text-gray-300 transition-colors group-hover:text-[color:var(--hb)] sm:block" strokeWidth={2.5} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {!searching && (
        <>
          {/* ── Start here ──────────────────────────────────── */}
          <section className="bg-white">
            <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
              <h2 className="text-2xl font-extrabold sm:text-3xl">New to WorkBench? Start here</h2>
              <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-3">
                {startHere.map(({ article }, i) => (
                  <Link key={article.slug} prefetch={false} href={`${base}/${article.slug}`} className="group block">
                    <span className="help-num">0{i + 1}</span>
                    <h3 className="mt-3 text-[17px] font-extrabold transition-colors group-hover:text-[color:var(--hb)]">{article.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">{article.summary}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-[color:var(--hb)]">
                      Read the guide
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ── Every topic ─────────────────────────────────── */}
          <section className="border-t border-gray-200 bg-[#F6F8FB]">
            <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
              <h2 className="text-2xl font-extrabold sm:text-3xl">Browse by topic</h2>

              {/* Phone: one list, each topic opens in place (the site's FAQ list) */}
              <div className="mt-6 divide-y divide-gray-200 overflow-hidden rounded-[1.25rem] border border-gray-200 bg-white lg:hidden">
                {HELP_SECTIONS.map((s) => {
                  const Icon = HELP_ICONS[s.icon];
                  return (
                    <details key={s.id} id={s.id} className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3.5 px-5 py-4 [&::-webkit-details-marker]:hidden">
                        <Icon className="h-5 w-5 flex-none text-[color:var(--ho)]" strokeWidth={1.9} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15.5px] font-bold text-gray-900">{s.title}</span>
                          <span className="block text-[13px] text-gray-500">
                            {s.articles.length} {s.articles.length === 1 ? "guide" : "guides"}
                          </span>
                        </span>
                        <ChevronDown
                          className="h-4 w-4 flex-none text-gray-400 transition-transform duration-200 group-open:rotate-180"
                          strokeWidth={2.5}
                        />
                      </summary>
                      <ul className="border-t border-gray-100 bg-[#F6F8FB] py-1">
                        {s.articles.map((a) => (
                          <li key={a.slug}>
                            <Link
                              prefetch={false}
                              href={`${base}/${a.slug}`}
                              className="flex items-center gap-3 py-3 pl-[54px] pr-5 text-[14.5px] text-gray-700 active:bg-gray-100"
                            >
                              <span className="min-w-0 flex-1">{a.title}</span>
                              <ChevronRight className="h-4 w-4 flex-none text-gray-300" strokeWidth={2.5} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>

              {/* Desktop: flat columns, like the features page */}
              <div className="mt-10 hidden gap-x-10 gap-y-12 lg:grid lg:grid-cols-3">
                {HELP_SECTIONS.map((s) => {
                  const Icon = HELP_ICONS[s.icon];
                  return (
                    <div key={s.id} id={s.id} className="scroll-mt-24">
                      <div className="flex gap-3.5">
                        <Icon className="mt-0.5 h-5 w-5 flex-none text-[color:var(--ho)]" strokeWidth={1.9} />
                        <div className="min-w-0">
                          <h3 className="text-[16.5px] font-extrabold">{s.title}</h3>
                          <p className="mt-0.5 text-[14px] leading-relaxed text-gray-600">{s.tagline}</p>
                          <ul className="mt-3 space-y-1.5">
                            {s.articles.map((a) => (
                              <li key={a.slug}>
                                <Link
                                  prefetch={false}
                                  href={`${base}/${a.slug}`}
                                  className="text-[14.5px] font-semibold text-[color:var(--hb)] hover:underline hover:decoration-[color:var(--ho)] hover:underline-offset-4"
                                >
                                  {a.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
