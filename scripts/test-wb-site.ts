/**
 * Marketing-site accuracy checks (David 2026-10-27: "ensure everything
 * advertised is accurate and if anything ever changes, it is changed on
 * every page"). Two halves:
 *
 * 1. No hard-coded prices on any marketing page. Seats, per-user and plan
 *    prices, processing rates and Atlas token counts must come from
 *    lib/plans.ts / lib/atlas-pricing.ts, so a change there reaches every
 *    page on the same deploy. The scan is over the SOURCE of app/(wbsite),
 *    components/wb, lib/wb-*.ts and lib/llms.ts.
 * 2. The trade pages: every trade's feature titles resolve in the catalog,
 *    its photo and phone shot exist, it has steps and an FAQ, and the
 *    sitemap + llms.txt list every trade page and the free plan page.
 *
 *   npx tsx scripts/test-wb-site.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sitemap from "../app/sitemap";
import { llmsTxt } from "../lib/llms";
import { featureByTitle } from "../lib/wb-features";
import { FREE_PAGE_PATH } from "../lib/wb-free";
import { WB_SHOTS } from "../lib/wb-site";
import { TRADES, freePlanFaq } from "../lib/wb-trades";

let failed = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

// ── 1. Price literals ──────────────────────────────────────────────────────
const PRICE_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\$(?!0\b)\d+(?:\.\d{2})?\s?(?:a|per|\/)\s?(?:month|mo\b|user|seat|extra)/i, why: "a monthly / per-user price (use formatCents + lib/plans)" },
  { re: /\$(?!0\b)\d+(?:\.\d{2})?\s?(?:flat|one-time)/i, why: "a flat price (use formatCents + lib/plans)" },
  { re: /\d+(?:\.\d+)?%\s?\+\s?\d+¢/, why: "a processing rate (use RATES from lib/plans)" },
  { re: /\d+(?:\.\d+)?%\s?(?:per|on)\s(?:card|ACH)/i, why: "a processing rate (use RATES from lib/plans)" },
  { re: /\d{1,3},\d{3}\s(?:free\s)?(?:Atlas\s)?tokens/i, why: "a token allowance (use tokenCount(ATLAS_FREE_TOKENS / ATLAS_PLAN_TOKENS))" },
  { re: /\b(?:for|first)\s\d+\susers\b/i, why: "a seat count (use INCLUDED_SEATS)" },
  { re: /\b\d+\s(?:free\s)?users\s(?:included|free)\b/i, why: "a seat count (use INCLUDED_SEATS)" },
  { re: /\b(?:two|three)\susers\b/i, why: "a seat count spelled out (use INCLUDED_SEATS)" },
];

/** Files whose numbers are not WorkBench prices. */
const ALLOW: RegExp[] = [
  /texting-registration[\\/]page\.tsx$/, // "about $7 a month" is Google Workspace's price
  /lib[\\/]wb-savings\.ts$/, // competitor list prices + the benchmark rate, dated; scripts/test-wb-savings.ts checks their age
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [
  ...walk("app/(wbsite)"),
  ...walk("components/wb"),
  ...readdirSync("lib")
    .filter((f) => /^wb-.*\.ts$/.test(f))
    .map((f) => join("lib", f)),
  join("lib", "llms.ts"),
];

for (const file of files) {
  if (ALLOW.some((re) => re.test(file))) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { re, why } of PRICE_PATTERNS) {
      const m = line.match(re);
      if (m) check(false, `${file}:${i + 1} hard-codes ${why}: "${m[0]}"`);
    }
  });
}

// ── 2. Trades ──────────────────────────────────────────────────────────────
const slugs = new Set<string>();
for (const t of TRADES) {
  check(/^[a-z0-9-]+$/.test(t.slug), `trade "${t.name}": slug "${t.slug}" is not url-safe`);
  check(!slugs.has(t.slug), `trade slug "${t.slug}" is used twice`);
  slugs.add(t.slug);
  check(t.photo.src.startsWith("https://") && t.photo.alt.length > 0, `trade ${t.slug}: photo needs src + alt`);
  check(t.shot in WB_SHOTS, `trade ${t.slug}: unknown phone shot "${t.shot}"`);
  check(t.steps.length === 3, `trade ${t.slug}: expected 3 steps, got ${t.steps.length}`);
  check(t.faq.length >= 3, `trade ${t.slug}: needs at least 3 FAQ items`);
  check(t.features.length >= 4, `trade ${t.slug}: needs at least 4 features`);
  for (const title of t.features) {
    try {
      featureByTitle(title);
    } catch {
      check(false, `trade ${t.slug}: feature "${title}" is not in lib/wb-features.ts`);
    }
  }
  check(t.description.length >= 80 && t.description.length <= 320, `trade ${t.slug}: meta description should be 80–320 chars (${t.description.length})`);
  // The trade copy must be number-free on prices (the template adds them from lib/plans).
  const texts = [t.intro, t.description, t.chip.title, t.chip.sub, ...t.headline, ...t.steps.flatMap((s) => [s.title, s.body]), ...[...t.faq, freePlanFaq(t)].flatMap((f) => [f.q, f.a])];
  for (const s of texts) {
    for (const { re, why } of PRICE_PATTERNS) {
      const m = s.match(re);
      if (m) check(false, `trade ${t.slug} copy hard-codes ${why}: "${m[0]}"`);
    }
  }
}

// ── 3. Sitemap + llms.txt list every page ──────────────────────────────────
const urls = new Set(sitemap().map((e) => e.url));
check(urls.has("https://workbenchfsm.com/trades"), "sitemap: missing /trades");
check(urls.has(`https://workbenchfsm.com${FREE_PAGE_PATH}`), `sitemap: missing ${FREE_PAGE_PATH}`);
for (const t of TRADES) check(urls.has(`https://workbenchfsm.com/trades/${t.slug}`), `sitemap: missing /trades/${t.slug}`);

const llms = llmsTxt();
check(llms.includes(`https://workbenchfsm.com${FREE_PAGE_PATH}`), `llms.txt: missing ${FREE_PAGE_PATH}`);
for (const t of TRADES) check(llms.includes(`https://workbenchfsm.com/trades/${t.slug}`), `llms.txt: missing /trades/${t.slug}`);

if (failed) {
  console.error(`\n${failed} marketing-site check(s) failed`);
  process.exit(1);
}
console.log(`✓ marketing site: ${files.length} files free of hard-coded prices, ${TRADES.length} trade pages consistent, sitemap + llms.txt complete`);
