/**
 * Live smoke test for the setup-wizard business lookup (grounded Gemini +
 * website fetch + brand color). Run with a real key:
 *   GEMINI_API_KEY=... npx tsx scripts/debug-lookup.ts "Business Name" "City" "TX"
 * Read-only — talks to Google and the business's public website, never the DB.
 */
import { lookupBusiness } from "../lib/business-lookup";
import { fetchWebsiteInfo } from "../lib/website-info";

const [name = "ABC Home & Commercial Services", city = "Austin", state = "TX"] =
  process.argv.slice(2);

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY");
  console.log(`Looking up: ${name} (${city}, ${state})`);
  const t0 = Date.now();
  const biz = await lookupBusiness(name, city, state);
  console.log(`\n${Date.now() - t0}ms →`, JSON.stringify(biz, null, 2));
  if (biz?.website) {
    const site = await fetchWebsiteInfo(biz.website);
    console.log(
      `\nwebsite fetch: title="${site?.title}" logo=${site?.logoUrl} theme=${site?.themeColor} textChars=${site?.text.length}`
    );
    console.log(`text preview: ${site?.text.slice(0, 300)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
