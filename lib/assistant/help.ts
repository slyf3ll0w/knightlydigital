import { findHelpArticle, articleMarkdown, searchHelp } from "../help/search";
import { str, type Tool } from "./core";

/**
 * The Help Center, for Atlas: "how do I…", "why can't I…", "where is…"
 * questions about using WorkBench itself. Read-only and free of side
 * effects, so every role gets it. Results are the same guides as
 * /app/help, so Atlas's answer and the page never disagree.
 *
 * Search returns titles + summaries (cheap); Atlas reads one guide in full
 * with `slug` when the summary isn't enough.
 */
const helpSearch: Tool = {
  decl: {
    name: "help_search",
    description:
      "Search the WorkBench Help Center for how the APP works: how-to steps, where a setting lives, what a status means, plan/role requirements, and fixes for common problems (calls, texting registration, payments, sync, notifications…). Use it for questions about USING WorkBench, not for the business's own data. Call with `query` to find guides (returns title, summary, slug, link), then with `slug` to read one guide in full. Answer from the guide in your own words and include its link (/app/help/<slug>).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "the user's question in a few words, e.g. 'refund a card payment', 'calls ring my cell not the browser'" },
        slug: { type: "string", description: "a guide's slug from an earlier search, to read the whole guide" },
      },
    },
  },
  allowed: () => true,
  run: async (_actor, args) => {
    const slug = str(args.slug, 80);
    if (slug) {
      const found = findHelpArticle(slug);
      if (!found) return { error: `No guide with slug '${slug}'. Search first.` };
      return {
        section: found.section.title,
        link: `/app/help/${found.article.slug}`,
        guide: articleMarkdown(found.article).replace(/^URL: .*$/m, `Link: /app/help/${found.article.slug}`),
      };
    }
    const query = str(args.query, 200);
    if (!query) return { error: "query or slug is required" };
    const hits = searchHelp(query, 5);
    if (hits.length === 0) {
      return { results: [], note: "No guide matches. Answer from what you know of the app, or suggest /app/support to ask the WorkBench team." };
    }
    return {
      results: hits.map((h) => ({
        slug: h.article.slug,
        title: h.article.title,
        section: h.section.title,
        summary: h.article.summary,
        link: `/app/help/${h.article.slug}`,
      })),
    };
  },
};

export const helpTools: Tool[] = [helpSearch];
