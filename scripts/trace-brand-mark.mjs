/**
 * Vector-trace the two-blade Streamflaire mark from the 2026-07 brand render:
 * hard-threshold each blade, walk every column's top/bottom edge, smooth the
 * polylines (kills pixel quantization; the true curves are smooth), and emit
 * a clean SVG — the source of truth for every logo/icon size.
 * Writes scripts/logo-debug/mark.svg + comparison previews.
 * Run: node scripts/trace-brand-mark.mjs
 */
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";

const SRC = "C:/Users/David Lessly/Downloads/ChatGPT Image Jul 9, 2026, 01_32_28 PM (1).png";
const DEBUG = "scripts/logo-debug";
const REGION = { left: 180, top: 395, width: 250, height: 160 };

const { data, info } = await sharp(SRC)
  .extract(REGION)
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;

function maskOf(test) {
  const m = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (test(r, g, b)) m[p] = 1;
  }
  return m;
}
const greenM = maskOf((r, g, b) => g - Math.max(r, b) > 60);
const darkM = maskOf((r, g, b) => {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 80 && g - Math.max(r, b) < 18;
});

/** Per-column top/bottom edges of the largest vertical run, then smooth. */
function trace(mask) {
  const cols = [];
  for (let x = 0; x < W; x++) {
    let bestTop = -1, bestBot = -1, bestLen = 0, top = -1;
    for (let y = 0; y <= H; y++) {
      const on = y < H && mask[y * W + x];
      if (on && top === -1) top = y;
      if (!on && top !== -1) {
        if (y - top > bestLen) { bestLen = y - top; bestTop = top; bestBot = y - 1; }
        top = -1;
      }
    }
    if (bestLen >= 2) cols.push({ x, top: bestTop, bot: bestBot });
  }
  // drop 1-2 col specks at the ends
  while (cols.length && cols[1] && cols[1].x - cols[0].x > 2) cols.shift();
  while (cols.length > 1 && cols[cols.length - 1].x - cols[cols.length - 2].x > 2) cols.pop();
  const smooth = (arr) => arr.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -3; k <= 3; k++) {
      const v = arr[i + k];
      if (v !== undefined) { s += v; n++; }
    }
    return s / n;
  });
  const tops = smooth(cols.map((c) => c.top));
  const bots = smooth(cols.map((c) => c.bot + 1));
  return { xs: cols.map((c) => c.x), tops, bots };
}

function pathOf({ xs, tops, bots }) {
  const pts = [];
  for (let i = 0; i < xs.length; i++) pts.push(`${xs[i]},${tops[i].toFixed(2)}`);
  for (let i = xs.length - 1; i >= 0; i--) pts.push(`${xs[i]},${bots[i].toFixed(2)}`);
  return `M${pts.join(" L")} Z`;
}

const green = trace(greenM);
const dark = trace(darkM);
console.log("green blade cols:", green.xs.length, "x", green.xs[0], "→", green.xs[green.xs.length - 1]);
console.log("dark blade cols:", dark.xs.length, "x", dark.xs[0], "→", dark.xs[dark.xs.length - 1]);

// Both blades are the same shape; the green one's bottom edge is drowned in
// glow, but its TOP edge keys cleanly — measure the translation between the
// blades there and reuse the crisp dark trace for both.
const dx = green.xs[0] - dark.xs[0];
const darkTopAt = new Map(dark.xs.map((x, i) => [x, dark.tops[i]]));
let dySum = 0, dyN = 0;
for (let i = 0; i < green.xs.length * 0.6; i++) {
  const gx = green.xs[i];
  const ref = darkTopAt.get(gx - dx);
  if (ref !== undefined) { dySum += green.tops[i] - ref; dyN++; }
}
const dy = dySum / dyN;
console.log("green offset from dark: dx", dx, "dy", dy.toFixed(1));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <path d="${pathOf(dark)}" fill="#343A36"/>
  <path d="${pathOf(dark)}" fill="#3FC952" transform="translate(${dx}, ${dy.toFixed(1)})"/>
</svg>`;

await mkdir(DEBUG, { recursive: true });
await writeFile(`${DEBUG}/mark.svg`, svg);

// preview: traced SVG next to the original render crop
const traced = await sharp(Buffer.from(svg), { density: 72 * 4 }).png().toBuffer();
const orig = await sharp(SRC).extract(REGION).resize(W * 4).png().toBuffer();
const tMeta = await sharp(traced).metadata();
const bg = Buffer.from(
  `<svg width="${tMeta.width}" height="${tMeta.height * 2 + 30}"><rect width="100%" height="100%" fill="#ffffff"/></svg>`
);
await sharp(bg)
  .composite([
    { input: orig, left: 0, top: 0 },
    { input: traced, left: 0, top: tMeta.height + 30 },
  ])
  .png()
  .toFile(`${DEBUG}/mark-trace-compare.png`);
console.log("done — check", `${DEBUG}/mark-trace-compare.png`);
