/**
 * The blog at workbenchfsm.com/blog: the pure half (no DB, no AI), safe to
 * import from the Console's client component and the unit test
 * (scripts/test-blog.ts). The server half is lib/blog.ts; the writer is
 * lib/blog-writer.ts.
 *
 * A post body is the same block list the announcements use
 * (AnnouncementBlock: p / h / list / steps), so the post page lays any post
 * out the same way. In the Console it is edited as plain text:
 *
 *   ## A heading
 *   A paragraph. Blank lines separate paragraphs.
 *   - **Bold title.** Bullet text
 *   - A bullet without a title
 *   1. A numbered step
 */
import type { AnnouncementBlock } from "@/lib/wb-announcements";

export const BLOG_PATH = "/blog";
export const BLOG_TZ = "America/Chicago";

export type BlogBlock = AnnouncementBlock;
export type BlogStatus = "QUEUED" | "PUBLISHED" | "HELD" | "PULLED";

/** Categories the writer rotates through so the blog doesn't write the same kind of post twice in a row. */
export const BLOG_TOPICS = [
  "Pricing and estimates",
  "Getting paid",
  "Winning more jobs",
  "Running the crew",
  "Keeping customers",
  "Marketing and reviews",
  "Running the business",
  "Working smarter with software",
] as const;

export function blogPostPath(p: { slug: string }): string {
  return `${BLOG_PATH}/${p.slug}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

// ── Body ⇄ text ─────────────────────────────────────────────────────────────

/** Blocks → the plain text the Console edits. Pure. */
export function blocksToText(blocks: BlogBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "h") return `## ${b.text}`;
      if (b.type === "p") return b.text;
      if (b.type === "steps") return b.items.map((s, i) => `${i + 1}. ${s}`).join("\n");
      return b.items.map((i) => (i.title ? `- **${i.title}** ${i.text}` : `- ${i.text}`)).join("\n");
    })
    .join("\n\n");
}

/** The Console's plain text → blocks. Pure; the inverse of blocksToText. */
export function textToBlocks(text: string): BlogBlock[] {
  const out: BlogBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    const t = para.join(" ").replace(/\s+/g, " ").trim();
    if (t) out.push({ type: "p", text: t });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }
    const h = /^#{1,6}\s+(.+)$/.exec(line);
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const step = /^\d+[.)]\s+(.+)$/.exec(line);
    if (h) {
      flushPara();
      out.push({ type: "h", text: h[1].trim() });
    } else if (bullet) {
      flushPara();
      const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(bullet[1]);
      const item = m ? { title: m[1].trim(), text: m[2].trim() } : { text: bullet[1].trim() };
      const last = out[out.length - 1];
      if (last?.type === "list") last.items.push(item);
      else out.push({ type: "list", items: [item] });
    } else if (step) {
      flushPara();
      const last = out[out.length - 1];
      if (last?.type === "steps") last.items.push(step[1].trim());
      else out.push({ type: "steps", items: [step[1].trim()] });
    } else {
      para.push(line);
    }
  }
  flushPara();
  return out;
}

/** Anything that isn't a well-formed block list (a stored Json value) → the blocks that are. Pure. */
export function sanitizeBlocks(v: unknown): BlogBlock[] {
  if (!Array.isArray(v)) return [];
  const out: BlogBlock[] = [];
  for (const b of v) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if ((o.type === "p" || o.type === "h") && text) out.push({ type: o.type, text });
    else if (o.type === "steps" && Array.isArray(o.items)) {
      const items = o.items
        .map((i) => (typeof i === "string" ? i : i && typeof i === "object" && typeof (i as { text?: unknown }).text === "string" ? (i as { text: string }).text : ""))
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length) out.push({ type: "steps", items });
    } else if (o.type === "list" && Array.isArray(o.items)) {
      const items = o.items
        .map((i) => {
          if (typeof i === "string") return { text: i.trim() };
          if (!i || typeof i !== "object") return null;
          const r = i as { title?: unknown; text?: unknown };
          const t = typeof r.text === "string" ? r.text.trim() : "";
          const title = typeof r.title === "string" ? r.title.trim() : "";
          return t ? (title ? { title, text: t } : { text: t }) : null;
        })
        .filter((i): i is { title?: string; text: string } => i !== null);
      if (items.length) out.push({ type: "list", items });
    }
  }
  return out;
}

export function blocksWordCount(blocks: BlogBlock[]): number {
  return blocksToText(blocks)
    .replace(/[#*\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

// ── Checks a post must pass before it can go up on its own ──────────────────

/**
 * WorkBench prices, rates, seat counts and token allowances are never typed
 * into the site (they come from lib/plans.ts; scripts/test-wb-site.ts holds
 * the hand-written pages to the same rule). A post that states one is held
 * for a person. Dollar amounts as general advice ("a $150 service call") are
 * fine.
 */
const WORKBENCH_NUMBERS: RegExp[] = [
  /\$\d+(?:\.\d{2})?\s?(?:a|per|\/)\s?(?:month|mo\b|user|seat)/i,
  /\d+(?:\.\d+)?%\s?\+\s?\d+¢/,
  /\d+(?:\.\d+)?%\s?(?:per|on)\s(?:card|ACH)/i,
  /\d{1,3},\d{3}\s(?:free\s)?(?:Atlas\s)?tokens/i,
  /\bfree\s(?:for|with)\s(?:up\sto\s)?(?:\d+|two|three)\susers\b/i,
];

/** Whether text states a WorkBench price, rate, seat count or token allowance. Pure. */
export function statesWorkbenchNumbers(text: string): boolean {
  return WORKBENCH_NUMBERS.some((re) => re.test(text));
}

/** Real people and companies that must never appear on the site. */
const NEVER_NAMED: RegExp[] = [/summit plumbing/i];

/** Why a post can't go up on its own, or [] when it can. Pure. */
export function postProblems(p: { title: string; summary: string; blocks: BlogBlock[] }): string[] {
  const problems: string[] = [];
  const all = `${p.title}\n${p.summary}\n${blocksToText(p.blocks)}`;
  if (p.title.trim().length < 15 || p.title.length > 110) problems.push("The title is too short or too long.");
  if (p.summary.trim().length < 40 || p.summary.length > 260) problems.push("The summary should be one or two sentences.");
  const words = blocksWordCount(p.blocks);
  if (words < 500) problems.push(`The post is short (${words} words).`);
  if (!p.blocks.some((b) => b.type === "h")) problems.push("The post has no headings.");
  if (statesWorkbenchNumbers(all)) problems.push("It states a WorkBench price, rate or allowance. Those come from the pricing page, never typed into a post.");
  if (NEVER_NAMED.some((re) => re.test(all))) problems.push("It names a real WorkBench customer.");
  if (/\[(?:insert|your|company|name)[^\]]*\]|lorem ipsum|as an ai\b/i.test(all)) problems.push("It has placeholder or AI boilerplate text.");
  return problems;
}

// ── The day's slot ──────────────────────────────────────────────────────────

/** "2026-11-25" and the hour (0–23) of `at` in the blog's time zone. Pure. */
export function blogClock(at: Date, timeZone: string = BLOG_TZ): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/**
 * Is a post due now? Once the day's publish hour has come, and nothing has
 * gone up yet today (a post published by hand counts as the day's post).
 * Pure.
 */
export function postDue(now: Date, publishHour: number, lastPublishedAt: Date | null, timeZone: string = BLOG_TZ): boolean {
  const c = blogClock(now, timeZone);
  if (c.hour < publishHour) return false;
  if (!lastPublishedAt) return true;
  return blogClock(lastPublishedAt, timeZone).day !== c.day;
}

/**
 * The day ("YYYY-MM-DD") each queued post will go up, in queue order. Pure.
 * The first one goes up today unless today's post is already up.
 */
export function queueDays(count: number, now: Date, postedToday: boolean, timeZone: string = BLOG_TZ): string[] {
  const [y, m, d] = blogClock(now, timeZone).day.split("-").map(Number);
  const first = postedToday ? 1 : 0;
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + first + i, 12)).toISOString().slice(0, 10));
}

/** "November 25, 2026" from a stored day ("YYYY-MM-DD") or a date (read in the blog's zone). */
export function blogDate(at: Date | string, timeZone: string = BLOG_TZ): string {
  const fmt = { year: "numeric", month: "long", day: "numeric" } as const;
  if (typeof at === "string") return new Date(`${at}T12:00:00Z`).toLocaleDateString("en-US", { ...fmt, timeZone: "UTC" });
  return at.toLocaleDateString("en-US", { ...fmt, timeZone });
}
