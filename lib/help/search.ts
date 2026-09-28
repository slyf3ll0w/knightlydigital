/**
 * Help Center lookups shared by the pages, Atlas's help_search tool and the
 * text export. Pure functions over HELP_SECTIONS — no I/O.
 */
import { HELP_SECTIONS } from "./content";
import type { HelpArticle, HelpBlock, HelpSection } from "./types";

export { HELP_SECTIONS };

export interface HelpHit {
  article: HelpArticle;
  section: HelpSection;
  score: number;
}

const ALL: { article: HelpArticle; section: HelpSection }[] = HELP_SECTIONS.flatMap((section) =>
  section.articles.map((article) => ({ article, section })),
);

export function helpArticleCount(): number {
  return ALL.length;
}

export function findHelpArticle(slug: string): { article: HelpArticle; section: HelpSection } | null {
  return ALL.find((a) => a.article.slug === slug) ?? null;
}

export function findHelpSection(id: string): HelpSection | null {
  return HELP_SECTIONS.find((s) => s.id === id) ?? null;
}

/** Previous/next article in reading order (across sections). */
export function helpNeighbors(slug: string): { prev: HelpArticle | null; next: HelpArticle | null } {
  const i = ALL.findIndex((a) => a.article.slug === slug);
  return {
    prev: i > 0 ? ALL[i - 1].article : null,
    next: i >= 0 && i < ALL.length - 1 ? ALL[i + 1].article : null,
  };
}

/** Strip the inline markup down to plain words. */
export function plainText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function blockText(b: HelpBlock): string {
  switch (b.type) {
    case "p":
    case "h":
    case "tip":
    case "warn":
      return b.text;
    case "steps":
    case "list":
      return b.items.join(" ");
    case "faq":
      return b.items.map((f) => `${f.q} ${f.a}`).join(" ");
  }
}

export function articleBodyText(a: HelpArticle): string {
  return plainText(a.blocks.map(blockText).join(" "));
}

const STOP = new Set([
  "a", "an", "the", "i", "my", "me", "do", "does", "how", "to", "can", "is", "it", "in", "on", "of", "for",
  "and", "or", "what", "why", "where", "when", "with", "we", "you", "your", "our", "this", "that", "be", "are",
  "get", "set", "up", "use", "using", "workbench", "app",
]);

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** A crude stem so "invoices"/"invoicing" meet "invoice". */
function stem(t: string): string {
  return t.replace(/(ing|ies|es|s|ed)$/, "") || t;
}

/**
 * Rank articles for a free-text question. Title and keyword matches weigh
 * most, then the summary, then the body. Returns best first; empty when
 * nothing matches.
 */
export function searchHelp(query: string, limit = 8): HelpHit[] {
  const qs = terms(query).map(stem);
  if (qs.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const { article, section } of ALL) {
    const title = article.title.toLowerCase();
    const keys = (article.keywords ?? []).join(" ").toLowerCase();
    const summary = article.summary.toLowerCase();
    const sectionTitle = section.title.toLowerCase();
    const body = articleBodyText(article).toLowerCase();
    let score = 0;
    let matched = 0;
    for (const t of qs) {
      let s = 0;
      if (title.includes(t)) s += 6;
      if (keys.includes(t)) s += 5;
      if (summary.includes(t)) s += 3;
      if (sectionTitle.includes(t)) s += 2;
      if (body.includes(t)) s += 1 + Math.min(2, body.split(t).length - 2);
      if (s > 0) matched += 1;
      score += s;
    }
    if (score === 0) continue;
    // Reward covering more of the question's words.
    score *= 0.5 + matched / qs.length;
    hits.push({ article, section, score });
  }
  hits.sort((a, b) => b.score - a.score);
  // Drop the long tail: a guide that only shares a common word with the question.
  const floor = (hits[0]?.score ?? 0) * 0.25;
  return hits.filter((h) => h.score >= floor).slice(0, limit);
}

/** One article as Markdown — used by the text export and by Atlas. */
export function articleMarkdown(a: HelpArticle, base = "https://workbenchfsm.com"): string {
  const out: string[] = [`## ${a.title}`, "", `URL: ${base}/help/${a.slug}`, "", plainText(a.summary), ""];
  const meta: string[] = [];
  if (a.where) meta.push(`Where: ${a.where.label} (${a.where.href})`);
  if (a.plan) meta.push(`Plan: ${a.plan}`);
  if (a.roles) meta.push(`Who: ${a.roles}`);
  if (meta.length) out.push(...meta, "");
  for (const b of a.blocks) {
    switch (b.type) {
      case "p":
        out.push(plainText(b.text), "");
        break;
      case "h":
        out.push(`### ${plainText(b.text)}`, "");
        break;
      case "steps":
        out.push(...b.items.map((s, i) => `${i + 1}. ${plainText(s)}`), "");
        break;
      case "list":
        out.push(...b.items.map((s) => `- ${plainText(s)}`), "");
        break;
      case "tip":
        out.push(`Good to know: ${plainText(b.text)}`, "");
        break;
      case "warn":
        out.push(`Heads up: ${plainText(b.text)}`, "");
        break;
      case "faq":
        out.push("Troubleshooting:", "");
        for (const f of b.items) out.push(`- Q: ${plainText(f.q)}`, `  A: ${plainText(f.a)}`);
        out.push("");
        break;
    }
  }
  return out.join("\n").trim();
}

/** The whole Help Center as one Markdown document. */
export function helpCenterMarkdown(base = "https://workbenchfsm.com"): string {
  const parts: string[] = [
    "# WorkBench Help Center",
    "",
    "> How to use WorkBench FSM, field service management software for home-service teams. Each article covers one task: where it lives in the app, the steps, and fixes for common problems. Paths like /app/quotes are inside the signed-in web app (workbenchfsm.com/app/…) and the iPhone/Android apps.",
    "",
  ];
  for (const s of HELP_SECTIONS) {
    parts.push(`# ${s.title}`, "", s.tagline, "");
    for (const a of s.articles) parts.push(articleMarkdown(a, base), "");
  }
  return parts.join("\n");
}
