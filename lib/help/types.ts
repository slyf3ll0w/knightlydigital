/**
 * Help Center content model. The articles are plain data so three readers
 * share one source: the Help Center pages (/help public, /app/help in the
 * app), Atlas's `help_search` tool, and the plain-text export at
 * /help/all.md for outside AI assistants and search engines.
 *
 * Inline text supports **bold**, `UI label` (renders as a key/label chip),
 * and [link text](/app/path) — nothing else, so every reader can handle it.
 */

export type HelpBlock =
  /** A paragraph. */
  | { type: "p"; text: string }
  /** A small heading inside an article. */
  | { type: "h"; text: string }
  /** Numbered steps (the heart of most articles). */
  | { type: "steps"; items: string[] }
  /** A bulleted list. */
  | { type: "list"; items: string[] }
  /** "Good to know" — a helpful aside. */
  | { type: "tip"; text: string }
  /** "Heads up" — something that trips people up or can't be undone. */
  | { type: "warn"; text: string }
  /** Troubleshooting: the questions people actually ask. */
  | { type: "faq"; items: { q: string; a: string }[] };

export interface HelpArticle {
  /** Globally unique; the URL is /help/<slug>. */
  slug: string;
  title: string;
  /** One line, shown in lists and search results, and given to Atlas. */
  summary: string;
  /** Extra words people search with that aren't in the title. */
  keywords?: string[];
  /** Where it lives in the app — renders an "Open …" button. */
  where?: { label: string; href: string };
  /** Plan needed, when it isn't in the free Core plan (e.g. "Pro"). */
  plan?: string;
  /** Who can do it, when it isn't everyone (e.g. "Owners and admins"). */
  roles?: string;
  blocks: HelpBlock[];
}

export interface HelpSection {
  id: string;
  title: string;
  /** Icon key, mapped to a lucide icon in components/help (keeps this file UI-free). */
  icon: HelpIconKey;
  tagline: string;
  articles: HelpArticle[];
}

export type HelpIconKey =
  | "start"
  | "clients"
  | "leads"
  | "jobs"
  | "schedule"
  | "quotes"
  | "agreements"
  | "invoices"
  | "payments"
  | "estimator"
  | "phone"
  | "texting"
  | "automations"
  | "atlas"
  | "team"
  | "time"
  | "routes"
  | "portal"
  | "reports"
  | "settings"
  | "mobile"
  | "billing";
