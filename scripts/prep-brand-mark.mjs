/**
 * Extract the two-blade leaf mark from the 2026-07 brand render (crop the
 * mark region, key green + dark ink off a blurred background estimate,
 * upscale masks 4× and re-crisp edges, flat recolor).
 * Writes public/streamflaire-hub-mark.png + a tile variant + debug previews.
 * Run: node scripts/prep-brand-mark.mjs
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

const SRC = "C:/Users/David Lessly/Downloads/ChatGPT Image Jul 9, 2026, 01_32_28 PM (1).png";
const DEBUG = "scripts/logo-debug";
const REGION = { left: 170, top: 390, width: 260, height: 170 }; // generous mark crop
const SCALE = 4;

const GREEN = { r: 0x3f, g: 0xc9, b: 0x52 };
const DARK = { r: 0x33, g: 0x39, b: 0x35 };
const DARK_ON_TILE = { r: 0x9a, g: 0xa3, b: 0x9c }; // lifted for the dark app tile

const crop = sharp(SRC).extract(REGION);
const { data, info } = await crop.clone().raw().toBuffer({ resolveWithObject: true });
const bgBuf = await crop.clone().blur(25).raw().toBuffer();
const W = info.width, H = info.height, ch = info.channels;

const greenMask = Buffer.alloc(W * H);
const darkMask = Buffer.alloc(W * H);
for (let p = 0, i = 0; p < W * H; p++, i += ch) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const bgLuma = 0.2126 * bgBuf[i] + 0.7152 * bgBuf[i + 1] + 0.0722 * bgBuf[i + 2];
  const greenScore = g - Math.max(r, b);
  const darkScore = bgLuma - luma;
  greenMask[p] = Math.max(0, Math.min(255, (greenScore - 35) * 5));
  darkMask[p] = greenScore > 18 ? 0 : Math.max(0, Math.min(255, (darkScore - 16) * 6));
}

async function crispMask(mask) {
  // toColourspace("b-w") — the pipeline otherwise promotes 1-channel raw to
  // 3 channels and the composer reads it with the wrong stride
  const { data: out, info: outInfo } = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .resize(W * SCALE, H * SCALE, { kernel: "lanczos3" })
    .blur(1.4)
    .linear(4, -390)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (outInfo.channels !== 1) throw new Error(`mask has ${outInfo.channels} channels`);
  return out;
}
const greenHi = await crispMask(greenMask);
const darkHi = await crispMask(darkMask);
const HW = W * SCALE, HH = H * SCALE;

function compose(darkColor) {
  const out = Buffer.alloc(HW * HH * 4);
  for (let p = 0, j = 0; p < HW * HH; p++, j += 4) {
    const ga = greenHi[p], da = darkHi[p];
    if (ga >= da) {
      out[j] = GREEN.r; out[j + 1] = GREEN.g; out[j + 2] = GREEN.b; out[j + 3] = ga;
    } else {
      out[j] = darkColor.r; out[j + 1] = darkColor.g; out[j + 2] = darkColor.b; out[j + 3] = da;
    }
  }
  return sharp(out, { raw: { width: HW, height: HH, channels: 4 } }).png().toBuffer();
}

await mkdir(DEBUG, { recursive: true });
const markBuf = await sharp(await compose(DARK)).trim({ threshold: 10 }).png().toBuffer();
const meta = await sharp(markBuf).metadata();
console.log("mark:", meta.width, "x", meta.height);
await sharp(markBuf).toFile("public/streamflaire-hub-mark.png");
const tileBuf = await sharp(await compose(DARK_ON_TILE)).trim({ threshold: 10 }).png().toBuffer();
await sharp(tileBuf).toFile(`${DEBUG}/mark-tile-variant.png`);

// previews on white + ink
for (const [color, name] of [["#ffffff", "mark-on-white"], ["#0C0F0C", "mark-on-ink"]]) {
  const src = name === "mark-on-ink" ? tileBuf : markBuf;
  const m = await sharp(src).metadata();
  const bg = Buffer.from(
    `<svg width="${m.width + 60}" height="${m.height + 60}"><rect width="100%" height="100%" fill="${color}"/></svg>`
  );
  await sharp(bg).composite([{ input: src, left: 30, top: 30 }]).png().toFile(`${DEBUG}/${name}.png`);
}
console.log("done");
