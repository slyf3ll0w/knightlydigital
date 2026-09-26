// node marketing/app-store/capture.mjs — fresh phone screens for the App
// Store slides, taken from a running app (local dev or staging) at 3x, so the
// slides never upscale a 640px image again.
//
//   BASE=http://localhost:3077 EMAIL=… PASSWORD=… node marketing/app-store/capture.mjs
//
// Writes marketing/app-store/screens/<name>.png (1170 x 2532). The demo data
// the slides mention (Knight Light Electric) is scripts/local-seed.mts.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3077";
const EMAIL = process.env.EMAIL ?? "david@local.test";
const PASSWORD = process.env.PASSWORD ?? "Local1234!";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "screens");
fs.mkdirSync(out, { recursive: true });

const SHOTS = [
  { name: "home", path: "/app/dashboard" },
  { name: "home-dark", path: "/app/dashboard", theme: "dark" },
  { name: "schedule", path: "/app/schedule" },
  { name: "jobs", path: "/app/jobs" },
  { name: "job", path: "FIRST:/app/jobs" },
  { name: "invoices", path: "/app/invoices" },
  { name: "invoice", path: "FIRST:/app/invoices" },
  { name: "clients", path: "/app/contacts" },
  { name: "quotes", path: "/app/quotes" },
  { name: "quote", path: "FIRST:/app/quotes" },
  { name: "more", path: "/app/dashboard", more: true },
];

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/app/login`);
await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(/dashboard/, { timeout: 60000 });
await page.evaluate(async () => {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
  for (const r of regs) await r.unregister();
});

for (const s of SHOTS) {
  await page.evaluate((t) => localStorage.setItem("hub-theme", t), s.theme ?? "light");
  let target = s.path;
  if (target.startsWith("FIRST:")) {
    const list = target.slice(6);
    await page.goto(`${BASE}${list}`, { waitUntil: "networkidle" });
    target = await page.evaluate((prefix) => {
      const a = Array.from(document.querySelectorAll(`a[href^="${prefix}/c"]`)).find((x) => /\/c[a-z0-9]+$/.test(x.getAttribute("href")));
      return a ? a.getAttribute("href") : prefix;
    }, list);
  }
  await page.goto(`${BASE}${target}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200); // reveal + count-up animations settle
  if (s.more) {
    await page.getByRole("button", { name: /^more$/i }).first().click();
    await page.waitForTimeout(900);
  }
  await page.evaluate(() => {
    document.querySelector("nextjs-portal")?.remove(); // the dev-only issue badge
    document.querySelectorAll('[class*="ds-wipe-bar"]').forEach((el) => el.remove());
  });
  await page.screenshot({ path: path.join(out, `${s.name}.png`) });
  console.log("captured", s.name, target);
}
await browser.close();
