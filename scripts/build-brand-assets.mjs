/**
 * Assemble the 2026-07 Streamflaire brand assets from the traced mark SVG
 * (scripts/logo-debug/mark.svg, from trace-brand-mark.mjs) and the
 * browser-rendered Oxanium wordmark (scripts/logo-debug/wordmark.png).
 * Emits:
 *   public/logo.png                  — mark + STREAMFLAIRE, transparent
 *   public/streamflaire-hub-logo.png — same
 *   public/streamflaire-hub-mark.png — mark alone (brand colors)
 *   public/pwa/icon-*.png, app/apple-icon.png, assets/icon-*.png — dark tile
 * Run: node scripts/build-brand-assets.mjs
 */
import sharp from "sharp";
import { mkdir, readFile } from "fs/promises";

const DEBUG = "scripts/logo-debug";
const GREEN = "#3FC952";
const DARK = "#343A36";
const DARK_ON_TILE = "#9AA39C"; // lifted so the top blade reads on #0C0F0C

const svgSrc = await readFile(`${DEBUG}/mark.svg`, "utf8");

/** Rasterize the mark SVG at a given pixel height (trimmed). */
async function markPng(height, { darkColor = DARK } = {}) {
  const svg = svgSrc.replace(`fill="${DARK}"`, `fill="${darkColor}"`);
  return sharp(Buffer.from(svg), { density: 72 * 40 })
    .resize({ height: Math.round(height * 1.4) }) // headroom, then trim
    .png()
    .toBuffer()
    .then((b) => sharp(b).trim({ threshold: 8 }).resize({ height }).png().toBuffer());
}

// ── full logo: mark + wordmark ───────────────────────────────────────────────
const wordmarkRaw = await sharp(`${DEBUG}/wordmark.png`).trim({ threshold: 8 }).png().toBuffer();
const wm = await sharp(wordmarkRaw).metadata();
// Proportions from the render: mark ≈ 1.5× the cap height, small gap, mark
// vertically centered against the letters
const capHeight = wm.height;
const markH = Math.round(capHeight * 1.5);
const gap = Math.round(capHeight * 0.42);
const mark = await markPng(markH);
const mm = await sharp(mark).metadata();

const totalW = mm.width + gap + wm.width;
const totalH = Math.max(mm.height, wm.height);
const logo = await sharp({
  create: { width: totalW, height: totalH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: mark, left: 0, top: Math.round((totalH - mm.height) / 2) },
    { input: wordmarkRaw, left: mm.width + gap, top: Math.round((totalH - wm.height) / 2) },
  ])
  .png()
  .toBuffer();
const lm = await sharp(logo).metadata();
console.log("logo:", lm.width, "x", lm.height, "aspect", (lm.width / lm.height).toFixed(2));
await sharp(logo).toFile("public/logo.png");
await sharp(logo).toFile("public/streamflaire-hub-logo.png");

// ── mark alone ───────────────────────────────────────────────────────────────
const markOut = await markPng(400);
await sharp(markOut).toFile("public/streamflaire-hub-mark.png");
const mo = await sharp(markOut).metadata();
console.log("mark:", mo.width, "x", mo.height);

// ── icons: mark on the dark tile ─────────────────────────────────────────────
await mkdir("public/pwa", { recursive: true });
async function tile(size, { radius, markScale }, outFile) {
  const m = await markPng(Math.round((size * markScale * mo.height) / mo.width), {
    darkColor: DARK_ON_TILE,
  }).then((b) => sharp(b).resize({ width: Math.round(size * markScale) }).png().toBuffer());
  const mMeta = await sharp(m).metadata();
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" fill="#0C0F0C"/>
    </svg>`
  );
  await sharp(bg)
    .composite([
      { input: m, left: Math.round((size - mMeta.width) / 2), top: Math.round((size - mMeta.height) / 2) },
    ])
    .png()
    .toFile(outFile);
}
await tile(512, { radius: 112, markScale: 0.7 }, "public/pwa/icon-512.png");
await tile(192, { radius: 42, markScale: 0.7 }, "public/pwa/icon-192.png");
await tile(512, { radius: 0, markScale: 0.58 }, "public/pwa/icon-maskable-512.png");
await tile(180, { radius: 0, markScale: 0.64 }, "app/apple-icon.png");
await tile(1024, { radius: 0, markScale: 0.62 }, "assets/icon-only.png");
await tile(1024, { radius: 0, markScale: 0.5 }, "assets/icon-foreground.png");
await sharp(
  Buffer.from(`<svg width="1024" height="1024"><rect width="1024" height="1024" fill="#0C0F0C"/></svg>`)
).png().toFile("assets/icon-background.png");

// ── previews ─────────────────────────────────────────────────────────────────
async function preview(src, color, outFile, pad = 40) {
  const m = await sharp(src).metadata();
  const bg = Buffer.from(
    `<svg width="${m.width + pad * 2}" height="${m.height + pad * 2}"><rect width="100%" height="100%" fill="${color}"/></svg>`
  );
  await sharp(bg).composite([{ input: src, left: pad, top: pad }]).png().toFile(outFile);
}
const logoSmall = await sharp(logo).resize({ height: 120 }).png().toBuffer();
await preview(logoSmall, "#ffffff", `${DEBUG}/final-logo-on-white.png`);
await preview(logoSmall, "#0C0F0C", `${DEBUG}/final-logo-on-ink.png`);
await preview(await readFile("public/pwa/icon-512.png"), "#ffffff", `${DEBUG}/final-icon.png`);
console.log("done");
