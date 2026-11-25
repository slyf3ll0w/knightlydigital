import Anthropic from "@anthropic-ai/sdk";
import { claudeClient, claudeEnabled } from "@/lib/ai-claude";
import { HELP_SECTIONS, findHelpArticle } from "@/lib/help/search";
import { TRADES } from "@/lib/wb-trades";
import { reportError } from "@/lib/report-error";
import { sanitizeBlocks, slugify, type BlogBlock } from "@/lib/blog-shared";

/**
 * Writes one blog post for workbenchfsm.com/blog with Claude Sonnet (David
 * 2026-11-25: "have Sonnet write posts and they post one a day"). Called by
 * lib/blog.ts, from the hourly cron when the queue is short and from
 * Console → Blog → Write one now. Never publishes: the post goes into the
 * queue (or is held) and lib/blog.ts decides.
 *
 * Request shape:
 * - structured outputs (output_config.format): the reply is the post as
 *   JSON, so there is nothing to scrape out of prose;
 * - the system prompt is the stable half (who we are, house rules, the Help
 *   Center index) and carries the cache breakpoint; the topic, the titles
 *   already written and David's notes go in the user turn;
 * - server-side fallbacks ("default"), so a classifier refusal on a
 *   harmless business topic retries on a model that can answer instead of
 *   losing the day's post;
 * - no temperature (a 400 on the 5.5 models); variety comes from the topic
 *   rotation and the list of titles already used.
 */

export const BLOG_MODEL = "claude-sonnet-5-5";

export type WrittenPost = {
  title: string;
  slug: string;
  summary: string;
  keyword: string | null;
  helpSlug: string | null;
  blocks: BlogBlock[];
  model: string;
  tokensIn: number;
  tokensOut: number;
};

const POST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "slug", "summary", "keyword", "helpSlug", "blocks"],
  properties: {
    title: { type: "string", description: "The headline. Plain and specific, under 70 characters, sentence case." },
    slug: { type: "string", description: "URL slug: lowercase words joined by hyphens, under 60 characters." },
    summary: { type: "string", description: "One or two sentences (under 220 characters) for the post list and the search-result description." },
    keyword: { type: "string", description: "The search phrase a home-service owner would type that this post answers." },
    helpSlug: {
      type: "string",
      description: "The slug of ONE Help Center guide from the list that a reader of this post would find useful next, or an empty string when none fits.",
    },
    blocks: {
      type: "array",
      description: "The body, in order. 900 to 1400 words in all.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "items"],
        properties: {
          type: { type: "string", enum: ["p", "h", "list", "steps"], description: "p = paragraph, h = section heading, list = bullets, steps = numbered steps" },
          text: { type: "string", description: "The paragraph or heading text. Empty for list and steps." },
          items: {
            type: "array",
            description: "For list and steps only (empty otherwise). A list item may have a short bold title; a step has no title.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text"],
              properties: { title: { type: "string" }, text: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

function helpIndex(): string {
  return HELP_SECTIONS.flatMap((s) => s.articles.filter((a) => !a.hidden).map((a) => `- ${a.slug}: ${a.title}. ${a.summary}`)).join("\n");
}

/** The stable half of the prompt. Exported for the unit test (it must never carry a price). */
export function blogSystemPrompt(): string {
  return `You write the blog on workbenchfsm.com, the website of WorkBench FSM ("WorkBench"), field service management software for home-service businesses.

# Who reads it
Owners and office managers of small home-service companies (one to fifteen people): ${TRADES.map((t) => t.name.toLowerCase()).join(", ")} and similar trades. They are busy, practical and allergic to fluff. Most found the post by searching a question.

# What a post is
A genuinely useful answer to one question a home-service owner has about running the business: pricing a job, writing estimates, getting paid faster, slow seasons, hiring, scheduling, reviews, keeping customers, staying organized. The post must be worth reading for someone who never uses WorkBench. Mention WorkBench at most once or twice, only where it naturally helps (for example "in WorkBench, that's the Requests list"), and never as a hard sell.

# What WorkBench is (facts you may use; never add features beyond these or the Help Center list)
WorkBench covers the whole job: online booking, a lead pipeline, quotes with e-signature and deposits, scheduling and dispatch, clock-in and timesheets, team chat, one-click invoicing, card and ACH payments, saved cards and autopay, recurring billing, payment reminders, a client portal, review requests, and Atlas, a built-in AI assistant you can type or talk to. There are iPhone and Android apps. There is a free plan that is not a trial; paid add-ons exist. Never state a WorkBench price, processing rate, seat count, token allowance or plan detail: say "see the pricing page" if it matters.

# House rules
- Plain, direct American English. Short paragraphs (two to four sentences). Talk to the reader as "you".
- Concrete beats general: real numbers as worked examples (a $185 service call, a 3-person crew, 40 billable hours), real wording they can copy (a text to send, a line for an estimate), real steps.
- Never invent statistics, studies, surveys, quotes or customers. No "studies show", no "according to experts", no made-up percentages. Example numbers are fine when they are clearly examples.
- Never name a real business as a WorkBench customer. For an example company use the fictional Brightwire Electric, or "a two-truck plumbing shop".
- Do not attack competitors or name their prices.
- No legal, tax or insurance advice beyond "check with your accountant / your state" where it matters.
- Avoid filler and AI-sounding phrasing: no "In today's fast-paced world", "game-changer", "unlock", "elevate", "seamless", "navigate the complexities", "it's important to note", "in conclusion", no rhetorical question openers, no emoji, no exclamation marks.
- Start with the answer or a specific situation, not a definition. End with a short, practical wrap-up section (not titled "Conclusion").
- Structure: an opening paragraph or two, then 3 to 6 sections each opened with an "h" block. Use a "list" or "steps" block where it truly helps; at least one per post.
- Headings are plain phrases in sentence case, no numbering, no colons.

# Help Center guides you may point to (slug: title. summary)
${helpIndex()}`;
}

export function blogUserPrompt(opts: { topic: string; trade: string | null; usedTitles: string[]; guidance: string | null }): string {
  const used = opts.usedTitles.length ? opts.usedTitles.map((t) => `- ${t}`).join("\n") : "(none yet)";
  return [
    `Write today's post. Category: ${opts.topic}.`,
    opts.trade ? `If it fits naturally, make the examples about ${opts.trade.toLowerCase()} businesses; otherwise write for home-service businesses in general.` : "",
    opts.guidance?.trim() ? `Standing notes from the owner of WorkBench (follow them):\n${opts.guidance.trim()}` : "",
    `Posts already on the blog or waiting in the queue. Pick a clearly different question; do not repeat or lightly reword any of these:\n${used}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type RawPost = {
  title?: unknown;
  slug?: unknown;
  summary?: unknown;
  keyword?: unknown;
  helpSlug?: unknown;
  blocks?: unknown;
};

/** The model's JSON → a post, or null when it is unusable. Pure; exported for the unit test. */
export function parseWrittenPost(json: string): Omit<WrittenPost, "model" | "tokensIn" | "tokensOut"> | null {
  let raw: RawPost;
  try {
    raw = JSON.parse(json) as RawPost;
  } catch {
    return null;
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!title || !summary) return null;
  // The schema asks list/steps for items and p/h for text; drop the empty half.
  const blocks = sanitizeBlocks(
    Array.isArray(raw.blocks)
      ? raw.blocks.map((b) => {
          const o = (b ?? {}) as { type?: string; text?: string; items?: { title?: string; text?: string }[] };
          if (o.type === "steps") return { type: "steps", items: (o.items ?? []).map((i) => i.text ?? "") };
          if (o.type === "list") return { type: "list", items: (o.items ?? []).map((i) => ({ title: i.title ?? "", text: i.text ?? "" })) };
          return { type: o.type, text: o.text };
        })
      : [],
  );
  if (blocks.length === 0) return null;
  const helpSlug = typeof raw.helpSlug === "string" && raw.helpSlug.trim() && findHelpArticle(raw.helpSlug.trim()) ? raw.helpSlug.trim() : null;
  const keyword = typeof raw.keyword === "string" && raw.keyword.trim() ? raw.keyword.trim().slice(0, 120) : null;
  return {
    title: title.slice(0, 140),
    slug: slugify(typeof raw.slug === "string" && raw.slug.trim() ? raw.slug : title) || slugify(title),
    summary: summary.slice(0, 400),
    keyword,
    helpSlug,
    blocks,
  };
}

/** One post from Sonnet, or an error saying why not. */
export async function writeBlogPost(opts: { topic: string; trade: string | null; usedTitles: string[]; guidance: string | null }): Promise<
  { ok: true; post: WrittenPost } | { ok: false; error: string }
> {
  if (!claudeEnabled()) return { ok: false, error: "ANTHROPIC_API_KEY is not set on this environment." };
  try {
    const res = await claudeClient().beta.messages.create(
      {
        model: BLOG_MODEL,
        max_tokens: 16_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: blogSystemPrompt(), cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: POST_SCHEMA } },
        messages: [{ role: "user", content: blogUserPrompt(opts) }],
      },
      { timeout: 240_000 },
    );
    const tokensIn = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    const tokensOut = res.usage.output_tokens;
    if (res.stop_reason === "refusal") {
      reportError("blog writer: refusal", res.model, res.stop_details?.category ?? null);
      return { ok: false, error: "The model declined to write this one. The next run picks another topic." };
    }
    if (res.stop_reason === "max_tokens") return { ok: false, error: "The post ran past the length limit and came back cut off." };
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const post = parseWrittenPost(text);
    if (!post) return { ok: false, error: "The reply was not a usable post." };
    return { ok: true, post: { ...post, model: res.model, tokensIn, tokensOut } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "Rate limited by Anthropic; the next run tries again." };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: "Could not reach Anthropic; the next run tries again." };
    if (err instanceof Anthropic.APIError) {
      reportError("blog writer: API error", err.status, err.message.slice(0, 500));
      return { ok: false, error: `Anthropic API error ${err.status ?? ""}: ${err.message.slice(0, 200)}` };
    }
    reportError("blog writer: request failed", err);
    return { ok: false, error: "The request failed." };
  }
}
