/**
 * The blog's pure logic (lib/blog-shared.ts, lib/blog-writer.ts): the
 * Console's text format round-trips, the checks hold a bad post, the daily
 * slot is computed in Chicago time, and the writer's prompt never carries a
 * WorkBench price. No DB, no API calls.
 *
 *   npx tsx scripts/test-blog.ts
 */
import { statesWorkbenchNumbers, blocksToText, postDue, postProblems, queueDays, sanitizeBlocks, slugify, textToBlocks, blogClock, type BlogBlock } from "../lib/blog-shared";
// lib/blog-writer pulls in the Prisma client through lib/ai-claude; it is built, never connected.
process.env.DATABASE_URL ??= "postgresql://test@localhost:5432/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { blogSystemPrompt, blogUserPrompt, parseWrittenPost } = require("../lib/blog-writer") as typeof import("../lib/blog-writer");

let failed = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Text ⇄ blocks ───────────────────────────────────────────────────────────
const blocks: BlogBlock[] = [
  { type: "p", text: "Opening paragraph." },
  { type: "h", text: "Price the job, not the hour" },
  { type: "p", text: "Second paragraph." },
  { type: "list", items: [{ title: "Bold one.", text: "With text." }, { text: "Plain bullet." }] },
  { type: "steps", items: ["First step.", "Second step."] },
];
check(eq(textToBlocks(blocksToText(blocks)), blocks), "text round-trip changes the post");
check(eq(textToBlocks("line one\nline two\n\nnext"), [{ type: "p", text: "line one line two" }, { type: "p", text: "next" }]), "wrapped lines join into one paragraph");
check(eq(textToBlocks("# H\r\n* a\r\n2) b"), [{ type: "h", text: "H" }, { type: "list", items: [{ text: "a" }] }, { type: "steps", items: ["b"] }]), "CRLF, * bullets and 2) steps parse");
check(eq(sanitizeBlocks([{ type: "p", text: " " }, { type: "x" }, null, { type: "steps", items: ["a", ""] }]), [{ type: "steps", items: ["a"] }]), "sanitizeBlocks drops junk");
check(slugify("How to Price a Job & Win It!") === "how-to-price-a-job-and-win-it", "slugify");

// ── Checks ──────────────────────────────────────────────────────────────────
const longBody: BlogBlock[] = [{ type: "h", text: "A section" }, { type: "p", text: "word ".repeat(600) }];
const good = { title: "How to price a drain cleaning job", summary: "A plain way to set a price that covers your time, your truck and a profit, with a worked example.", blocks: longBody };
check(postProblems(good).length === 0, `a good post is held: ${postProblems(good).join(" ")}`);
check(postProblems({ ...good, blocks: [...longBody, { type: "p", text: "WorkBench is $29 per month." }] }).length > 0, "a WorkBench price is not caught");
check(postProblems({ ...good, blocks: [...longBody, { type: "p", text: "Card payments cost 2.9% + 30¢." }] }).length > 0, "a processing rate is not caught");
check(postProblems({ ...good, blocks: [...longBody, { type: "p", text: "Charge a $185 service call." }] }).length === 0, "an example dollar amount is held");
check(postProblems({ ...good, blocks: [...longBody, { type: "p", text: "Ask Summit Plumbing." }] }).length > 0, "a real customer's name is not caught");
check(postProblems({ ...good, blocks: [{ type: "h", text: "x" }, { type: "p", text: "short" }] }).length > 0, "a short post is not caught");
check(postProblems({ ...good, blocks: [{ type: "p", text: "word ".repeat(600) }] }).length > 0, "a post with no headings is not caught");

// ── The daily slot (America/Chicago; CST is UTC-6 in late November) ─────────
const at = (iso: string) => new Date(iso);
check(eq(blogClock(at("2026-11-25T14:30:00Z")), { day: "2026-11-25", hour: 8 }), "blogClock in Chicago");
check(eq(blogClock(at("2026-11-26T03:00:00Z")), { day: "2026-11-25", hour: 21 }), "blogClock late evening stays on the Chicago day");
check(!postDue(at("2026-11-25T14:00:00Z"), 9, null), "due before the hour"); // 8 AM CST
check(postDue(at("2026-11-25T15:00:00Z"), 9, null), "not due at the hour with nothing posted"); // 9 AM CST
check(!postDue(at("2026-11-25T20:00:00Z"), 9, at("2026-11-25T15:00:00Z")), "a second post the same day");
check(postDue(at("2026-11-26T15:00:00Z"), 9, at("2026-11-25T15:00:00Z")), "not due the next day");
check(!postDue(at("2026-11-26T04:00:00Z"), 9, at("2026-11-25T15:00:00Z")), "due at 10 PM the same Chicago day (UTC already tomorrow)");
check(eq(queueDays(3, at("2026-11-25T20:00:00Z"), false), ["2026-11-25", "2026-11-26", "2026-11-27"]), "queue days, today open");
check(eq(queueDays(2, at("2026-11-25T20:00:00Z"), true), ["2026-11-26", "2026-11-27"]), "queue days, today used");
check(eq(queueDays(1, at("2026-11-30T20:00:00Z"), true), ["2026-12-01"]), "queue days roll the month");

// ── The writer ──────────────────────────────────────────────────────────────
const sys = blogSystemPrompt();
check(!statesWorkbenchNumbers(sys), "the system prompt states a WorkBench price or rate");
check(sys.includes("Brightwire Electric"), "the system prompt lost the demo company");
const user = blogUserPrompt({ topic: "Getting paid", trade: "HVAC", usedTitles: ["Old post"], guidance: "Be brief." });
check(user.includes("Getting paid") && user.includes("hvac") && user.includes("Old post") && user.includes("Be brief."), "the user prompt misses an input");

const parsed = parseWrittenPost(
  JSON.stringify({
    title: "How to get paid on the day of the job",
    slug: "Get Paid Same Day!",
    summary: "Collect before you leave the driveway.",
    keyword: "get paid faster plumbing",
    helpSlug: "no-such-guide",
    blocks: [
      { type: "p", text: "Intro.", items: [] },
      { type: "h", text: "Ask at the door", items: [] },
      { type: "list", text: "", items: [{ title: "", text: "Plain." }, { title: "Bold.", text: "Titled." }] },
      { type: "steps", text: "", items: [{ title: "", text: "One." }] },
    ],
  }),
);
check(parsed !== null, "a well-formed reply did not parse");
if (parsed) {
  check(parsed.slug === "get-paid-same-day", "the slug is not cleaned");
  check(parsed.helpSlug === null, "an unknown Help guide is kept");
  check(
    eq(parsed.blocks, [
      { type: "p", text: "Intro." },
      { type: "h", text: "Ask at the door" },
      { type: "list", items: [{ text: "Plain." }, { title: "Bold.", text: "Titled." }] },
      { type: "steps", items: ["One."] },
    ]),
    "the blocks are not normalized",
  );
}
check(parseWrittenPost("not json") === null, "junk parses");

if (failed) {
  console.error(`\n${failed} blog check(s) failed`);
  process.exit(1);
}
console.log("✓ blog: text format, checks, daily slot and writer prompt");
