/**
 * Help Center content checks: unique slugs, every [link](/help/…) points at
 * a real guide, markup is balanced, popular/start-here slugs exist, and
 * search finds the obvious guide for common questions.
 *   npx tsx scripts/test-help-content.ts
 */
import { HELP_SECTIONS, POPULAR_SLUGS, START_HERE_SLUGS } from "../lib/help/content";
import { articleMarkdown, findHelpArticle, helpCenterMarkdown, searchHelp } from "../lib/help/search";
import type { HelpBlock } from "../lib/help/types";
import { llmsFullTxt, llmsTxt } from "../lib/llms";

let failed = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

function strings(b: HelpBlock): string[] {
  switch (b.type) {
    case "p":
    case "h":
    case "tip":
    case "warn":
      return [b.text];
    case "steps":
    case "list":
      return b.items;
    case "faq":
      return b.items.flatMap((f) => [f.q, f.a]);
  }
}

const slugs = new Set<string>();
const sectionIds = new Set<string>();
for (const s of HELP_SECTIONS) {
  check(!sectionIds.has(s.id), `duplicate section id ${s.id}`);
  sectionIds.add(s.id);
  check(s.articles.length > 0, `section ${s.id} has no guides`);
  for (const a of s.articles) {
    check(/^[a-z0-9-]+$/.test(a.slug), `bad slug ${a.slug}`);
    check(!slugs.has(a.slug), `duplicate slug ${a.slug}`);
    slugs.add(a.slug);
    check(a.summary.length > 0 && a.summary.length <= 140, `${a.slug}: summary missing or over 140 chars`);
    check(a.blocks.length > 0, `${a.slug}: no content`);
    const notes = a.blocks.filter((b) => "note" in b && b.note).length;
    check(notes <= 1, `${a.slug}: at most one arrow note per guide (has ${notes})`);
    if (a.where) check(a.where.href.startsWith("/app/"), `${a.slug}: where.href must be an /app/ path`);
  }
}

for (const s of HELP_SECTIONS) {
  for (const a of s.articles) {
    for (const text of [a.summary, ...a.blocks.flatMap(strings)]) {
      check((text.match(/\*\*/g) ?? []).length % 2 === 0, `${a.slug}: unbalanced ** in "${text.slice(0, 60)}"`);
      check((text.match(/`/g) ?? []).length % 2 === 0, `${a.slug}: unbalanced \` in "${text.slice(0, 60)}"`);
      for (const m of text.matchAll(/\]\((\/help\/[^)]+)\)/g)) {
        const target = m[1].slice("/help/".length);
        check(slugs.has(target), `${a.slug}: link to missing guide ${m[1]}`);
      }
      for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
        check(/^(\/|https:\/\/)/.test(m[1]), `${a.slug}: link must be a path or https URL: ${m[1]}`);
      }
    }
  }
}

for (const s of [...POPULAR_SLUGS, ...START_HERE_SLUGS]) check(slugs.has(s), `featured slug ${s} missing`);

// Search sanity: the obvious guide ranks first for everyday phrasing.
const expect: [string, string][] = [
  ["how do I refund a payment", "refund-a-payment"],
  ["customers can't hear me on calls", "fix-call-audio"],
  ["texting registration rejected", "texting-registration-status"],
  ["import clients from jobber", "import-clients"],
  ["change invoice number", "quote-and-invoice-numbers"],
  ["my pay button is missing", "how-clients-pay"],
  ["connect quickbooks", "quickbooks"],
  ["add an employee", "add-team-members"],
  ["google calendar sync", "calendar-sync"],
  ["recurring weekly mowing", "recurring-visits"],
  ["how do I get more atlas tokens", "atlas-tokens"],
  ["how much is the pro plan", "plans-and-pricing"],
  ["how many users are included", "add-team-members"],
];
for (const [q, slug] of expect) {
  const top = searchHelp(q, 3).map((h) => h.article.slug);
  check(top.includes(slug), `search "${q}" → [${top.join(", ")}], expected ${slug} in the top 3`);
}
check(searchHelp("the").length === 0, "stop-word-only search should return nothing");

check(findHelpArticle("activate-payments") !== null, "findHelpArticle");
check(articleMarkdown(findHelpArticle("refund-a-payment")!.article).includes("## Refund a payment"), "articleMarkdown heading");
const md = helpCenterMarkdown();
check(!/\*\*|`/.test(md.replace(/^# .*$/gm, "")), "markdown export should have inline markup stripped");

// llms.txt: points AIs at the Help Center and never repeats claims the site dropped.
const llms = llmsTxt();
check(llms.includes("/help/all.md") && llms.includes("/help/topic/"), "llms.txt should link the Help Center and its topics");
check(!/unlimited users;|NOT part of the free|invite-only/i.test(llms), "llms.txt repeats a retired claim (unlimited free users / Atlas not free / invite-only)");
check(llmsFullTxt().includes("## Refund a payment"), "llms-full.txt should carry every guide");

const total = [...slugs].length;
if (failed) {
  console.error(`\n${failed} help-content check(s) failed`);
  process.exit(1);
}
console.log(`help content ok: ${HELP_SECTIONS.length} sections, ${total} guides, ${md.length.toLocaleString()} chars`);
