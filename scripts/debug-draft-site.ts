/**
 * Live check: website-aware setup drafting. Fetches a real site and runs the
 * wizard's generate step with it, printing the drafted services (eyeball that
 * they reflect what the site actually sells). Read-only, no DB.
 *   GEMINI_API_KEY=... npx tsx scripts/debug-draft-site.ts <url> <industry> <city> <state>
 */
import { generateSetupDraft, sanitizeIntake } from "../lib/setup-wizard";
import { fetchWebsiteInfo } from "../lib/website-info";

const [url = "https://berretthomeservices.com/", industry = "Pest Control", city = "Dallas", state = "TX"] =
  process.argv.slice(2);

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY");
  const fetched = await fetchWebsiteInfo(url);
  const site = fetched === "parked" ? null : fetched;
  console.log(`site: title="${site?.title}" textChars=${site?.text.length}${fetched === "parked" ? " (PARKED)" : ""}`);
  const intake = sanitizeIntake({ industry, city, state, radius: "30mi", teamSize: "6-10", website: url });
  const draft = await generateSetupDraft("Debug Co", intake, [], site);
  console.log(`\nsource=${draft.source} tz=${draft.timezone} zips=${draft.serviceZips.length}`);
  console.log("services:");
  for (const s of draft.newServices) {
    console.log(`  - ${s.name} — $${s.price} (${s.priceDisplay}, ${s.durationMinutes ?? "no"} min)`);
  }
  console.log("intake questions:", draft.intakeQuestions.map((q) => q.label));
  console.log("contract:", draft.contract.name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
