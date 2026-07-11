/**
 * Faithful extraction of David's 2026-07 STREAMFLAIRE logo render: keep his
 * exact pixels (outlined letterforms, blade rendering) and only remove the
 * gray backdrop + glow. Ink test vs a heavy-blur background estimate:
 *   dark ink  = meaningfully darker than the local background
 *   green ink = strongly green
 * Alpha ramps on the score; colors stay original (unpremultiplied against
 * the local background so edges don't fringe gray).
 * Run: node scripts/extract-brand-logo-faithful.mjs [darkMin] [greenMin]
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

const SRC = "C:/Users/David Lessly/Downloads/ChatGPT Image Jul 9, 2026, 01_32_28 PM (1).png";
const DEBUG = "scripts/logo-debug";
const DARK_MIN = Number(process.argv[2] ?? 9);
const GREEN_MIN = Number(process.argv[3] ?? 45);
const RAMP = 0.22; // alpha per unit of score above threshold (0-1 per ~4.5 units)

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const bgBuf = await sharp(SRC).blur(50).ensureAlpha().raw().toBuffer();
const W = info.width, H = info.height;

const out = Buffer.alloc(W * H * 4);
for (let p = 0, i = 0; p < W * H; p++, i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const br = bgBuf[i], bgc = bgBuf[i + 1], bb = bgBuf[i + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const bgLuma = 0.2126 * br + 0.7152 * bgc + 0.0722 * bb;
  const greenScore = g - Math.max(r, b);
  const bgGreen = bgc - Math.max(br, bb); // glow makes the local bg greenish too
  const darkScore = bgLuma - luma - DARK_MIN;
  const greenInk = greenScore - bgGreen - GREEN_MIN;
  const score = Math.max(darkScore, greenInk);
  let a = Math.max(0, Math.min(1, score * RAMP));
  if (a > 0) {
    // unpremultiply against the local background so soft edges keep the ink
    // color instead of dragging gray in
    const ua = Math.max(a, 0.25);
    out[i] = Math.max(0, Math.min(255, br + (r - br) / ua));
    out[i + 1] = Math.max(0, Math.min(255, bgc + (g - bgc) / ua));
    out[i + 2] = Math.max(0, Math.min(255, bb + (b - bb) / ua));
    out[i + 3] = Math.round(a * 255);
  }
}

await mkdir(DEBUG, { recursive: true });
const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const trimmed = await sharp(png).trim({ threshold: 12 }).png().toBuffer();
const meta = await sharp(trimmed).metadata();
console.log("faithful logo:", meta.width, "x", meta.height, "aspect", (meta.width / meta.height).toFixed(2));
// 2× upscale for retina headroom at display sizes
const up = await sharp(trimmed).resize({ width: meta.width * 2, kernel: "lanczos3" }).png().toBuffer();
await sharp(up).toFile(`${DEBUG}/faithful.png`);

for (const [color, name] of [["#ffffff", "faithful-on-white"], ["#0C0F0C", "faithful-on-ink"], ["#F9FAFB", "faithful-on-gray50"]]) {
  const small = await sharp(up).resize({ height: 120 }).png().toBuffer();
  const sm = await sharp(small).metadata();
  const bg = Buffer.from(
    `<svg width="${sm.width + 80}" height="${sm.height + 80}"><rect width="100%" height="100%" fill="${color}"/></svg>`
  );
  await sharp(bg).composite([{ input: small, left: 40, top: 40 }]).png().toFile(`${DEBUG}/${name}.png`);
}
console.log("done — check", DEBUG);
