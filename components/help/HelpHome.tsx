"use client";

import "./help.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { HELP_SECTIONS, POPULAR_SLUGS } from "@/lib/help/content";
import { findHelpArticle, searchHelp } from "@/lib/help/search";
import WBScribble from "@/components/wb/WBScribble";
import { HELP_ICONS } from "./icons";
import HelpFooterBand from "./HelpFooterBand";

/** Stagger index for the app's ds-rise entrance. */
const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

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
 * Help Center home — the public /help and the in-app /app/help. A classic
 * help center: centered title + search on the site's bloom hero, a grid of
 * topic cards (each opens its topic page), popular guides, the navy band.
 * The title wipes in and the sections rise, like every app page.
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
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchHelp(query, 12), [query]);
  const searching = query.trim().length > 0;

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

  const popular = POPULAR_SLUGS.map((s) => findHelpArticle(s)).filter((a) => a !== null);

  return (
    <div className="ds help-root">
      {/* ── Hero: title + search ───────────────────────────── */}
      <section className={`help-hero ${inApp ? "" : "-mt-20 sm:-mt-24"}`}>
        <div
          className={`mx-auto max-w-6xl px-5 pb-12 text-center sm:px-8 sm:pb-16 ${
            inApp ? "pt-12 sm:pt-16" : "pt-[7.5rem] sm:pt-[9.5rem]"
          }`}
        >
          <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">
            <span className="ds-wipe">
              <span className="ds-wipe-text">How can we help?</span>
              <span className="ds-wipe-bar" aria-hidden />
            </span>
          </h1>

          {/* Search, with the site's hand-drawn note in its own column on wide screens */}
          <div className="mt-8 lg:grid lg:grid-cols-[1fr_minmax(0,42rem)_1fr] lg:items-center lg:gap-4">
          <div className="hidden items-end justify-end gap-2.5 pb-7 lg:flex" aria-hidden>
            <p className="whitespace-nowrap pb-1 text-right text-[15px] font-extrabold leading-snug text-[color:var(--hi)]">
              Type what
              <br />
              you&apos;re stuck on
            </p>
            <WBScribble variant="swoop" delay={0.9} className="h-[44px] w-[88px] flex-none" />
          </div>
          <form
            className="help-search ds-rise mx-auto w-full max-w-2xl text-left"
            style={rise(1)}
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
          <span className="hidden lg:block" />
          </div>

          {!searching && (
            <div className="ds-rise mt-5 hidden flex-wrap items-center justify-center gap-2 sm:flex" style={rise(2)}>
              <span className="mr-1 text-[13.5px] font-semibold text-gray-500">Popular:</span>
              {popular.slice(0, 4).map(({ article }) => (
                <Link key={article.slug} prefetch={false} href={`${base}/${article.slug}`} className="help-chip">
                  {article.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Search results ─────────────────────────────────── */}
      {searching && (
        <section>
          <div className="mx-auto max-w-4xl px-5 pb-16 sm:px-8">
            <p className="text-[14px] font-semibold text-gray-500">
              {hits.length === 0
                ? "No guides match that yet. Try fewer words, or the name of the screen you're on."
                : `Results for “${query.trim()}”`}
            </p>
            {hits.length > 0 && (
              <ul className="help-card mt-4 divide-y divide-gray-200 overflow-hidden">
                {hits.map(({ article, section }) => {
                  const Icon = HELP_ICONS[section.icon];
                  return (
                    <li key={article.slug}>
                      <Link
                        prefetch={false}
                        href={`${base}/${article.slug}`}
                        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#F6F8FB] sm:px-6"
                      >
                        <span className="help-tile help-tile-sm">
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15.5px] font-bold text-gray-900">
                            <Highlight text={article.title} query={query} />
                          </span>
                          <span className="mt-0.5 block truncate text-[14px] text-gray-600">
                            {section.title} · <Highlight text={article.summary} query={query} />
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-gray-300 group-hover:text-gray-500" strokeWidth={2.5} />
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
          {/* ── Topics ──────────────────────────────────────── */}
          <section>
            <div className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 sm:pb-16">
              <h2 className="ds-rise text-2xl font-extrabold sm:text-[1.75rem]" style={rise(3)}>
                Browse by topic
              </h2>
              <div className="mt-6 grid gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {HELP_SECTIONS.map((s, i) => {
                  const Icon = HELP_ICONS[s.icon];
                  return (
                    <Link
                      key={s.id}
                      prefetch={false}
                      href={`${base}/topic/${s.id}`}
                      className="help-card ds-rise group flex items-center gap-4 px-4 py-3.5 sm:items-start sm:p-6"
                      style={rise(4 + Math.min(i, 8))}
                    >
                      <span className="help-tile">
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <h3 className="text-[17px] font-extrabold leading-snug">{s.title}</h3>
                        <span className="mt-1 hidden text-[14px] leading-relaxed text-gray-600 sm:block">{s.tagline}</span>
                        <span className="mt-3 hidden sm:inline-flex items-center gap-0.5 text-[13.5px] font-bold text-[color:var(--hb)]">
                          {s.articles.length} {s.articles.length === 1 ? "guide" : "guides"}
                          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-gray-300 sm:hidden" strokeWidth={2.5} />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Popular guides ──────────────────────────────── */}
          <section className="border-t border-gray-200 bg-[#F6F8FB]">
            <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
              <h2 className="text-2xl font-extrabold sm:text-[1.75rem]">Popular guides</h2>
              <ul className="help-card mt-6 divide-y divide-gray-200 overflow-hidden">
                {popular.map(({ article, section }) => (
                  <li key={article.slug}>
                    <Link
                      prefetch={false}
                      href={`${base}/${article.slug}`}
                      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#F6F8FB] sm:px-6"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-bold text-gray-900">{article.title}</span>
                        <span className="mt-0.5 block text-[13.5px] text-gray-500">{section.title}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-gray-300 group-hover:text-gray-500" strokeWidth={2.5} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
