/**
 * Faithful-solid extraction of David's 2026-07 STREAMFLAIRE render.
 *
 * The render's letters are an outlined/embossed style on gray — unusable as
 * direct alpha. This keeps his EXACT glyph geometry instead: hard-key the
 * outlines + blades, flood-fill the letter interiors (counters — the holes
 * in R/A/E — stay open because they sit at background brightness), assign
 * each interior the color of its surrounding outline, and emit solid ink
 * with anti-aliased edges. His letterforms, cleaned up.
 *
 * Writes public/logo.png + public/streamflaire-hub-logo.png + previews.
 * Run: node scripts/extract-brand-logo-solid.mjs
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

const SRC = "C:/Users/David Lessly/Downloads/ChatGPT Image Jul 9, 2026, 01_32_28 PM (1).png";
const DEBUG = "scripts/logo-debug";
const DARK = { r: 0x34, g: 0x3a, b: 0x36 };
const GREEN = { r: 0x3f, g: 0xc9, b: 0x52 };

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const bgBuf = await sharp(SRC).blur(50).ensureAlpha().raw().toBuffer();
const W = info.width, H = info.height;
const N = W * H;

// ── 1. hard ink mask: 0 none, 1 dark, 2 green ───────────────────────────────
const ink = new Uint8Array(N);
const dist = new Float32Array(N); // how far below the local bg each pixel sits
for (let p = 0, i = 0; p < N; p++, i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const br = bgBuf[i], bgc = bgBuf[i + 1], bb = bgBuf[i + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const bgLuma = 0.2126 * br + 0.7152 * bgc + 0.0722 * bb;
  dist[p] = bgLuma - luma;
  const greenScore = g - Math.max(r, b) - Math.max(0, bgc - Math.max(br, bb));
  if (greenScore > 60) ink[p] = 2;
  else if (dist[p] > 18 && greenScore < 20) ink[p] = 1;
}

// ── 2. drop specks (tiny connected components) ───────────────────────────────
{
  const seen = new Uint8Array(N);
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!ink[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const comp = [s];
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q); comp.push(q); }
      }
    }
    if (comp.length < 40) for (const p of comp) ink[p] = 0;
  }
}

// ── 3. flood the outside (non-ink reachable from the border) ─────────────────
const outside = new Uint8Array(N);
{
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  for (const p of stack) if (!ink[p]) outside[p] = 1;
  while (stack.length) {
    const p = stack.pop();
    if (ink[p] || !outside[p]) continue;
    const x = p % W, y = (p / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (!ink[q] && !outside[q]) { outside[q] = 1; stack.push(q); }
    }
  }
}

// ── 4. enclosed regions: fill (darker than bg) vs counter (at bg level) ─────
{
  const seen = new Uint8Array(N);
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (ink[s] || outside[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const comp = [s];
    let distSum = 0;
    const border = { 1: 0, 2: 0 };
    while (stack.length) {
      const p = stack.pop();
      distSum += dist[p];
      const x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (ink[q]) border[ink[q]]++;
        else if (!outside[q] && !seen[q]) { seen[q] = 1; stack.push(q); comp.push(q); }
      }
    }
    const avgDist = distSum / comp.length;
    if (avgDist > 5.5) {
      const color = border[2] > border[1] ? 2 : 1;
      for (const p of comp) ink[p] = color;
    }
    // else: a counter — stays open
  }
}

// ── 5. emit per-color masks → AA upscale → composite solid colors ────────────
async function crispMask(which) {
  const m = Buffer.alloc(N);
  for (let p = 0; p < N; p++) if (ink[p] === which) m[p] = 255;
  const { data: outM, info: oi } = await sharp(m, { raw: { width: W, height: H, channels: 1 } })
    .resize(W * 2, H * 2, { kernel: "lanczos3" })
    .blur(0.9)
    .linear(2.4, -180)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (oi.channels !== 1) throw new Error("mask channels " + oi.channels);
  return outM;
}
const darkHi = await crispMask(1);
const greenHi = await crispMask(2);
const HW = W * 2, HH = H * 2;
const out = Buffer.alloc(HW * HH * 4);
for (let p = 0, j = 0; p < HW * HH; p++, j += 4) {
  const da = darkHi[p], ga = greenHi[p];
  if (ga >= da) {
    out[j] = GREEN.r; out[j + 1] = GREEN.g; out[j + 2] = GREEN.b; out[j + 3] = ga;
  } else {
    out[j] = DARK.r; out[j + 1] = DARK.g; out[j + 2] = DARK.b; out[j + 3] = da;
  }
}

await mkdir(DEBUG, { recursive: true });
const png = await sharp(out, { raw: { width: HW, height: HH, channels: 4 } }).png().toBuffer();
const logo = await sharp(png).trim({ threshold: 10 }).png().toBuffer();
const meta = await sharp(logo).metadata();
console.log("solid logo:", meta.width, "x", meta.height, "aspect", (meta.width / meta.height).toFixed(2));
await sharp(logo).toFile("public/logo.png");
await sharp(logo).toFile("public/streamflaire-hub-logo.png");

for (const [color, name] of [["#ffffff", "solid-on-white"], ["#0C0F0C", "solid-on-ink"]]) {
  const small = await sharp(logo).resize({ height: 110 }).png().toBuffer();
  const sm = await sharp(small).metadata();
  const bg = Buffer.from(
    `<svg width="${sm.width + 80}" height="${sm.height + 80}"><rect width="100%" height="100%" fill="${color}"/></svg>`
  );
  await sharp(bg).composite([{ input: small, left: 40, top: 40 }]).png().toFile(`${DEBUG}/${name}.png`);
}
console.log("done");
