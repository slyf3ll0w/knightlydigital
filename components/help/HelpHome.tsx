"use client";

import "./help.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Card } from "@/components/ds";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";
import { HELP_SECTIONS, POPULAR_SLUGS, START_HERE_SLUGS } from "@/lib/help/content";
import { findHelpArticle, helpArticleCount, searchHelp } from "@/lib/help/search";
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
 * Help Center home — shared by the public /help and the in-app /app/help.
 * Desktop: bloom hero with search + an Atlas fragment, "Start here", a grid
 * of every feature with its articles, the navy "still stuck" band.
 * Phone: search, popular chips, one grouped list of features that expand.
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
  const [openSection, setOpenSection] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchHelp(query, 12), [query]);
  const searching = query.trim().length > 0;
  const total = helpArticleCount();

  // "/" jumps to search (desktop habit); Escape clears it.
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
    <div className="space-y-8 lg:space-y-10">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="ds-rise help-hero px-5 pb-6 pt-7 sm:px-10 sm:pb-10 sm:pt-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <p className="help-label">Help Center</p>
            <h1 className="mt-3 text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-[color:var(--ds-ink)] sm:text-[42px]">
              How can we help?
            </h1>
            <p className="ds-small mt-2 text-[13.5px]">
              {total} guides to every part of WorkBench
            </p>

            <label className="help-search mt-5 sm:mt-7 lg:max-w-xl">
              <Search size={19} className="flex-none text-[color:var(--ds-muted)]" aria-hidden />
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
              {searching ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
                  aria-label="Clear search"
                >
                  <X size={17} />
                </button>
              ) : (
                <span className="mr-2 hidden lg:block" aria-hidden>
                  <span className="help-kbd">/</span>
                </span>
              )}
            </label>

            {!searching && (
              <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                <span className="ds-small hidden self-center pr-1 sm:inline">Popular:</span>
                {popular.map((a) => (
                  <Link key={a.slug} prefetch={false} href={`${base}/${a.slug}`} className="help-pill">
                    {a.title}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* A hand-built fragment, like the site's: Atlas answering from these guides. */}
          <div className="hidden lg:block" aria-hidden>
            <div className="help-bob ds-card ds-card-raised space-y-3 p-4">
              <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-[color:var(--ds-primary)] px-3.5 py-2 text-[13px] text-[color:var(--ds-on-primary)]">
                How do I refund a payment?
              </div>
              <div className="flex items-start gap-2.5">
                <AtlasMark size={28} accent={atlas.accent} className="flex-none rounded-[8px]" />
                <div className="rounded-2xl rounded-tl-md bg-[color:var(--ds-surface-2)] px-3.5 py-2.5 text-[13px] leading-snug text-[color:var(--ds-ink-2)]">
                  Go to Payments, press <span className="help-ui">↺</span> on the payment, enter the amount and confirm.
                  <span className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[color:var(--ds-primary)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-secondary)]" />
                    From the Help Center
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Search results ─────────────────────────────────── */}
      {searching && (
        <section className="ds-rise">
          <p className="ds-small mb-3">
            {hits.length === 0
              ? "No guides match that yet."
              : `${hits.length} ${hits.length === 1 ? "guide" : "guides"} for “${query.trim()}”`}
          </p>
          {hits.length > 0 ? (
            <Card className="ds-divide overflow-hidden">
              {hits.map(({ article, section }) => {
                const Icon = HELP_ICONS[section.icon];
                return (
                  <Link key={article.slug} prefetch={false} href={`${base}/${article.slug}`} className="ds-row">
                    <span className="help-tile help-tile-sm">
                      <Icon size={16} strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                        <Highlight text={article.title} query={query} />
                      </span>
                      <span className="ds-small mt-0.5 block truncate">
                        {section.title} · <Highlight text={article.summary} query={query} />
                      </span>
                    </span>
                    <ChevronRight size={16} className="flex-none text-[color:var(--ds-faint)]" />
                  </Link>
                );
              })}
            </Card>
          ) : (
            <Card className="px-5 py-6">
              <p className="ds-body">
                Try fewer words, or the name of the screen you&apos;re on (like “invoice” or “schedule”).
              </p>
            </Card>
          )}
        </section>
      )}

      {!searching && (
        <>
          {/* ── Start here ──────────────────────────────────── */}
          <section className="ds-rise" style={{ "--ds-i": 1 } as React.CSSProperties}>
            <h2 className="ds-h2 mb-3">New to WorkBench? Start here</h2>
            {/* Phone: one grouped list */}
            <Card className="ds-divide overflow-hidden lg:hidden">
              {startHere.map(({ article }, i) => (
                <Link key={article.slug} prefetch={false} href={`${base}/${article.slug}`} className="ds-row">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[color:var(--ds-primary)] text-[13px] font-semibold text-[color:var(--ds-on-primary)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                    {article.title}
                  </span>
                  <ChevronRight size={16} className="flex-none text-[color:var(--ds-faint)]" />
                </Link>
              ))}
            </Card>
            {/* Desktop: numbered cards */}
            <div className="hidden gap-4 lg:grid lg:grid-cols-3">
              {startHere.map(({ article }, i) => (
                <Card key={article.slug} href={`${base}/${article.slug}`} className="ds-card-link group p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--ds-primary)] text-[13.5px] font-semibold text-[color:var(--ds-on-primary)]">
                    {i + 1}
                  </span>
                  <p className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-[color:var(--ds-ink)]">{article.title}</p>
                  <p className="ds-small mt-1 text-[13.5px]">{article.summary}</p>
                  <p className="ds-link mt-4 inline-flex items-center gap-1 text-[13.5px]">
                    Read guide <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Every feature ───────────────────────────────── */}
          <section className="ds-rise" style={{ "--ds-i": 2 } as React.CSSProperties}>
            <h2 className="ds-h2 mb-3">Browse by feature</h2>

            {/* Phone: grouped rows that open in place */}
            <Card className="ds-divide overflow-hidden lg:hidden">
              {HELP_SECTIONS.map((s) => {
                const Icon = HELP_ICONS[s.icon];
                const open = openSection === s.id;
                return (
                  <div key={s.id} id={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpenSection(open ? null : s.id)}
                      aria-expanded={open}
                      className="ds-row w-full text-left"
                    >
                      <span className="help-tile help-tile-sm">
                        <Icon size={16} strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{s.title}</span>
                        <span className="ds-small block truncate">{s.articles.length} {s.articles.length === 1 ? "guide" : "guides"}</span>
                      </span>
                      <ChevronDown
                        size={17}
                        className={`flex-none text-[color:var(--ds-faint)] transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <div className="ds-rise bg-[color:var(--ds-surface-2)] py-1">
                        {s.articles.map((a) => (
                          <Link
                            key={a.slug}
                            prefetch={false}
                            href={`${base}/${a.slug}`}
                            className="flex items-center gap-3 py-2.5 pl-[60px] pr-4 text-[14px] text-[color:var(--ds-ink-2)] active:opacity-70"
                          >
                            <span className="min-w-0 flex-1">{a.title}</span>
                            <ChevronRight size={15} className="flex-none text-[color:var(--ds-faint)]" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* Desktop: a card per feature listing its guides */}
            <div className="hidden gap-4 lg:grid lg:grid-cols-3">
              {HELP_SECTIONS.map((s) => {
                const Icon = HELP_ICONS[s.icon];
                return (
                  <Card key={s.id} className="flex flex-col p-5">
                    <div id={s.id} className="flex items-start gap-3">
                      <span className="help-tile">
                        <Icon size={19} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[color:var(--ds-ink)]">{s.title}</h3>
                        <p className="ds-small mt-0.5 text-[13px]">{s.tagline}</p>
                      </div>
                    </div>
                    <ul className="mt-4 space-y-0.5 border-t border-[color:var(--ds-line)] pt-3">
                      {s.articles.map((a) => (
                        <li key={a.slug}>
                          <Link
                            prefetch={false}
                            href={`${base}/${a.slug}`}
                            className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] text-[color:var(--ds-ink-2)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-primary)]"
                          >
                            <span className="min-w-0 flex-1">{a.title}</span>
                            <ChevronRight
                              size={14}
                              className="flex-none text-[color:var(--ds-faint)] opacity-0 transition-opacity group-hover:opacity-100"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      <HelpFooterBand inApp={inApp} />
    </div>
  );
}
