// node marketing/app-store/render.mjs [outDir]
// Serves the repo root on a local port, renders slides.html?s=1…6 at
// 1290 x 2796 and writes App Store-ready JPEGs (App Store Connect rejects
// PNGs with alpha). Default outDir: ~/Downloads/WorkBench App Store screenshots.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const outDir = process.argv[2] ?? path.join(os.homedir(), "Downloads", "WorkBench App Store screenshots");
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const file = path.join(repo, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(3012, r));

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
for (let s = 1; s <= 6; s++) {
  await page.goto(`http://127.0.0.1:3012/marketing/app-store/slides.html?s=${s}`);
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const file = path.join(outDir, `workbench-${s}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  console.log("wrote", file);
}
await browser.close();
server.close();
