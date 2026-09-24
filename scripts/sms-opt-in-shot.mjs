/**
 * Renders public/sms-opt-in.png — the opt-in evidence every texting filing
 * cites (lib/business-line.ts OPT_IN_IMAGE_URL): a WorkBench request form
 * with the phone field and the SMS consent checkbox, wording pulled from
 * lib/sms-consent.ts so the picture can never drift from the live forms.
 * Re-run whenever smsConsentLabel changes, then commit the PNG.
 *
 *   node scripts/sms-opt-in-shot.mjs
 *
 * Uses the Playwright Chromium the e2e suite installs (npx playwright install chromium).
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const consentSrc = readFileSync(join(root, "lib/sms-consent.ts"), "utf8");
const labelMatch = consentSrc.match(/return `([^`]+)`;/);
if (!labelMatch) throw new Error("smsConsentLabel template not found in lib/sms-consent.ts");
const business = "Acme Plumbing";
const label = labelMatch[1].replace("${businessName}", business);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f4f6; font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; }
  .wrap { padding: 32px 44px; width: 760px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .logo { width: 36px; height: 36px; border-radius: 10px; background: #0B57D8; color: #fff; font-weight: 800; font-size: 14px; display: grid; place-items: center; }
  .brand h1 { font-size: 18px; margin: 0; font-weight: 800; }
  .brand p { margin: 2px 0 0; font-size: 12px; color: #6b7280; }
  h2 { font-size: 15px; margin: 0 0 10px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  label.f { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  .in { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 14px; height: 40px; background: #fff; }
  .in.ph { color: #9ca3af; }
  .row { margin-top: 12px; }
  .consent { margin-top: 16px; display: flex; gap: 10px; align-items: flex-start; border: 2px solid #0B57D8; background: #eff6ff; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.45; color: #374151; }
  .box { width: 16px; height: 16px; border: 1.5px solid #6b7280; border-radius: 4px; background: #fff; flex: none; margin-top: 2px; }
  .consent a { color: #0B57D8; text-decoration: underline; }
  .note { margin-top: 6px; font-size: 11px; color: #6b7280; }
  .btn { margin-top: 18px; background: #0B57D8; color: #fff; text-align: center; font-weight: 700; font-size: 15px; border-radius: 8px; padding: 13px; }
  .cap { margin-top: 18px; font-size: 12px; color: #4b5563; line-height: 1.5; }
</style></head><body><div class="wrap">
  <div class="card">
    <div class="brand"><div class="logo">AP</div><div><h1>${business}</h1><p>Request service · powered by WorkBench</p></div></div>
    <h2>Your details</h2>
    <div class="grid">
      <div><label class="f">First name</label><div class="in">Maria</div></div>
      <div><label class="f">Last name</label><div class="in">Lopez</div></div>
      <div><label class="f">Email</label><div class="in">maria@example.com</div></div>
      <div><label class="f">Mobile phone</label><div class="in">(214) 555-0100</div></div>
    </div>
    <div class="row"><label class="f">What do you need?</label><div class="in ph">Water heater is leaking…</div></div>
    <div class="consent"><div class="box"></div><div>${esc(label)} <a>Text terms</a> · <a>Privacy</a></div></div>
    <div class="note">The box is unchecked by default. Leaving it unchecked never blocks the request.</div>
    <div class="btn">Send request</div>
  </div>
  <p class="cap">Opt-in step on every WorkBench booking and service-request form (workbenchfsm.com/book/&lt;business&gt;). The business named in the checkbox is the sender; texts come from that business’s own registered number. Text terms: https://workbenchfsm.com/sms-terms · Privacy: https://workbenchfsm.com/privacy</p>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html);
const out = join(root, "public/sms-opt-in.png");
writeFileSync(out, await page.screenshot({ fullPage: true }));
await browser.close();
console.log(`wrote ${out}`);
