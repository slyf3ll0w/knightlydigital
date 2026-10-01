/**
 * Renders public/sms-opt-in-workbench.png — the opt-in evidence for the
 * platform's OWN toll-free texting filing (lib/business-line.ts
 * platformTollFreeInput): the live /apply page in its default state, with the
 * SMS consent checkbox UNCHECKED, plus a close-up of the checkbox and its
 * wording. Telnyx's reviewers rejected a cropped checkbox ("OPT in example
 * must be complete", 2026-09-22) and then the full form with the box ticked
 * ("Opt-In Checkbox is Pre-selected", 2026-10-01) — the picture has to show
 * that the applicant, not the form, ticks the box.
 *
 *   node scripts/sms-opt-in-workbench-shot.mjs [https://workbenchfsm.com]
 *
 * Uses the Edge channel of the Playwright the e2e suite installs (Smart App
 * Control blocks the unsigned bundled Chromium on David's box).
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = (process.argv[2] ?? "https://workbenchfsm.com").replace(/\/+$/, "");
const out = join(root, "public/sms-opt-in-workbench.png");

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1085, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${base}/apply`, { waitUntil: "load" }); // not networkidle: the site keeps a poll open
await page.locator("input[type=tel]").first().waitFor({ timeout: 30_000 });
// A phone number enables the checkbox (it is disabled without one); the box itself stays as it loads: unchecked.
await page.locator("input[type=tel]").first().fill("(469) 555-0142");
const box = page.locator("input[type=checkbox]").first();
if (await box.isChecked()) throw new Error("The consent checkbox is ticked on load — the form must not pre-select it.");
const consent = box.locator("xpath=ancestor::label[1]");
await consent.scrollIntoViewIfNeeded();
const closeUp = await consent.screenshot({ type: "png" });
const full = await page.screenshot({ fullPage: true, type: "png" });

// Compose: caption, the close-up, then the whole page — one PNG, the reviewer reads top to bottom.
const b64 = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
await page.setViewportSize({ width: 1085, height: 900 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; width: 1085px; }
  .cap { padding: 22px 28px 18px; border-bottom: 1px solid #e5e7eb; }
  .cap h1 { font-size: 20px; margin: 0 0 6px; font-weight: 800; }
  .cap p { margin: 4px 0; font-size: 14px; line-height: 1.5; color: #374151; }
  .cap b { color: #111827; }
  .close { padding: 18px 28px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
  .close h2 { font-size: 13px; margin: 0 0 10px; font-weight: 700; color: #6b7280; text-transform: none; }
  .close img { display: block; border: 2px solid #0B57D8; border-radius: 10px; background: #fff; padding: 10px; }
  .full h2 { font-size: 13px; margin: 0; padding: 14px 28px 8px; font-weight: 700; color: #6b7280; }
  .full img { display: block; width: 1085px; }
</style></head><body>
  <div class="cap">
    <h1>SMS opt-in on the WorkBench account application — ${base}/apply</h1>
    <p><b>The checkbox is not pre-selected.</b> It loads unchecked (as shown) and is disabled until the applicant types a mobile number; the applicant must tick it to agree to texts. Leaving it unchecked never blocks the application.</p>
    <p>Sender: Streamflaire Group LLC (WorkBench). Terms linked from the checkbox: ${base}/sms-terms · Privacy: ${base}/privacy. Every text includes STOP/HELP language.</p>
  </div>
  <div class="close"><h2>Close-up of the consent checkbox and its wording, exactly as it loads (unchecked)</h2><img src="${b64(closeUp)}" alt=""></div>
  <div class="full"><h2>The full application page, unchanged, with the mobile number filled in and the checkbox still unchecked</h2><img src="${b64(full)}" alt=""></div>
</body></html>`);
writeFileSync(out, await page.screenshot({ fullPage: true, type: "png" }));
await browser.close();
console.log(`wrote ${out}`);
