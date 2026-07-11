/**
 * One-shot prep for the 2026-07 Streamflaire brand render (gray background,
 * glow, dark STREAM + green FLAIRE, two-blade leaf mark).
 *
 * Keys the ink off the background (heavy-blur background estimate → dark and
 * green ink masks), upscales the masks 3× with edge smoothing so the shapes
 * stay crisp at icon sizes, recolors them flat, and emits:
 *   public/logo.png                    — full wordmark, transparent (light bg)
 *   public/streamflaire-hub-logo.png   — same file (hub login/register)
 *   public/streamflaire-hub-mark.png   — leaf mark, brand colors
 *   public/pwa/icon-*.png, app/apple-icon.png — mark on the dark tile
 *   assets/icon-*.png                  — capacitor icon sources
 * Debug previews land in scratch/ (on white, on ink, icon).
 *
 * Run: node scripts/prep-brand-logo-2026-07.mjs
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

const SRC = "C:/Users/David Lessly/Downloads/ChatGPT Image Jul 9, 2026, 01_32_28 PM (1).png";
const SCRATCH = "scripts/logo-debug";
const SCALE = 3; // mask upscale factor before edge-crisping

// Keying thresholds (source pixel vs blurred-background estimate)
const GREEN_MIN = 40; // g - max(r,b) beyond this = green ink (glow sits well below)
const DARK_MIN = 45; // bgLuma - luma beyond this = dark ink (drop shadow sits below)
const RAMP = 4; // alpha ramp steepness

// Flat recolors (sampled from the render's solid ink)
const GREEN = { r: 0x3f, g: 0xc9, b: 0x52 }; // brand green
const DARK = { r: 0x33, g: 0x39, b: 0x35 }; // console dark
const DARK_ON_TILE = { r: 0x8a, g: 0x93, b: 0x8c }; // lifted for the dark app tile

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// Background estimate: the glow is broad, so a heavy blur folds it INTO the
// background and the keying drops it — only hard ink survives.
const bgBuf = await sharp(SRC).blur(30).ensureAlpha().raw().toBuffer();

const greenMask = Buffer.alloc(W * H);
const darkMask = Buffer.alloc(W * H);
for (let p = 0, i = 0; p < W * H; p++, i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const bgLuma = 0.2126 * bgBuf[i] + 0.7152 * bgBuf[i + 1] + 0.0722 * bgBuf[i + 2];
  const greenScore = g - Math.max(r, b);
  const darkScore = bgLuma - luma;
  greenMask[p] = Math.max(0, Math.min(255, (greenScore - GREEN_MIN) * RAMP));
  // dark ink must not be green (the green letters are darker than bg too)
  darkMask[p] = greenScore > 20 ? 0 : Math.max(0, Math.min(255, (darkScore - DARK_MIN) * RAMP));
}

/** Upscale a mask with lanczos, then re-crisp the edge (blur + hard ramp). */
async function crispMask(mask) {
  return sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .resize(W * SCALE, H * SCALE, { kernel: "lanczos3" })
    .blur(1.1)
    .linear(4, -390) // steepen: 0..255 → hard edge around ~130 with AA ramp
    .raw()
    .toBuffer();
}

const greenHi = await crispMask(greenMask);
const darkHi = await crispMask(darkMask);
const HW = W * SCALE, HH = H * SCALE;

/** Compose the two ink layers into one RGBA buffer with flat colors. */
function compose(dark, darkColor) {
  const out = Buffer.alloc(HW * HH * 4);
  for (let p = 0, j = 0; p < HW * HH; p++, j += 4) {
    const ga = greenHi[p], da = dark[p];
    if (ga >= da) {
      out[j] = GREEN.r; out[j + 1] = GREEN.g; out[j + 2] = GREEN.b; out[j + 3] = ga;
    } else {
      out[j] = darkColor.r; out[j + 1] = darkColor.g; out[j + 2] = darkColor.b; out[j + 3] = da;
    }
  }
  return out;
}

await mkdir(SCRATCH, { recursive: true });
await mkdir("public/pwa", { recursive: true });

const fullRgba = compose(darkHi, DARK);
const fullPng = await sharp(fullRgba, { raw: { width: HW, height: HH, channels: 4 } })
  .png()
  .toBuffer();
const logoBuf = await sharp(fullPng).trim({ threshold: 8 }).png().toBuffer();
const logoMeta = await sharp(logoBuf).metadata();
console.log("logo:", logoMeta.width, "x", logoMeta.height, "aspect", (logoMeta.width / logoMeta.height).toFixed(2));
await sharp(logoBuf).toFile("public/logo.png");
await sharp(logoBuf).toFile("public/streamflaire-hub-logo.png");

// ── mark = everything left of the first wide alpha gap ──────────────────────
const t = await sharp(logoBuf).raw().toBuffer({ resolveWithObject: true });
const colHasInk = (x) => {
  for (let y = 0; y < t.info.height; y++) {
    if (t.data[(y * t.info.width + x) * 4 + 3] > 20) return true;
  }
  return false;
};
let markEnd = -1;
let runStart = -1;
for (let x = 0; x < t.info.width; x++) {
  if (!colHasInk(x)) {
    if (runStart === -1) runStart = x;
    if (x - runStart >= 25 && runStart > 60) {
      markEnd = runStart;
      break;
    }
  } else {
    runStart = -1;
  }
}
if (markEnd === -1) throw new Error("no gap found — mark not extracted");
const markBuf = await sharp(logoBuf)
  .extract({ left: 0, top: 0, width: markEnd, height: t.info.height })
  .trim({ threshold: 8 })
  .png()
  .toBuffer();
const markMeta = await sharp(markBuf).metadata();
console.log("mark:", markMeta.width, "x", markMeta.height);
await sharp(markBuf).toFile("public/streamflaire-hub-mark.png");

// Tile variant: the dark blade lifts to a light gray so it reads on #0C0F0C
const tileRgba = compose(darkHi, DARK_ON_TILE);
const tileMarkBuf = await sharp(
  await sharp(tileRgba, { raw: { width: HW, height: HH, channels: 4 } }).png().toBuffer()
)
  .trim({ threshold: 8 })
  .png()
  .toBuffer();
const tileMark = await sharp(tileMarkBuf)
  .extract({ left: 0, top: 0, width: markEnd, height: t.info.height })
  .trim({ threshold: 8 })
  .png()
  .toBuffer();

// ── icons: mark centered on the dark tile ───────────────────────────────────
async function tile(size, { radius, markScale }, outFile) {
  const markWidth = Math.round(size * markScale);
  const m = await sharp(tileMark).resize({ width: markWidth }).png().toBuffer();
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
await tile(512, { radius: 112, markScale: 0.68 }, "public/pwa/icon-512.png");
await tile(192, { radius: 42, markScale: 0.68 }, "public/pwa/icon-192.png");
await tile(512, { radius: 0, markScale: 0.56 }, "public/pwa/icon-maskable-512.png");
await tile(180, { radius: 0, markScale: 0.62 }, "app/apple-icon.png");

// Capacitor sources (regenerate native sets with @capacitor/assets on Mac)
await tile(1024, { radius: 0, markScale: 0.6 }, "assets/icon-only.png");
await tile(1024, { radius: 0, markScale: 0.5 }, "assets/icon-foreground.png");
await sharp(
  Buffer.from(`<svg width="1024" height="1024"><rect width="1024" height="1024" fill="#0C0F0C"/></svg>`)
).png().toFile("assets/icon-background.png");

// ── debug previews ───────────────────────────────────────────────────────────
async function preview(bgColor, outFile) {
  const bg = Buffer.from(
    `<svg width="${logoMeta.width + 80}" height="${logoMeta.height + 80}"><rect width="100%" height="100%" fill="${bgColor}"/></svg>`
  );
  await sharp(bg).composite([{ input: logoBuf, left: 40, top: 40 }]).png().toFile(outFile);
}
await preview("#ffffff", `${SCRATCH}/logo-on-white.png`);
await preview("#0C0F0C", `${SCRATCH}/logo-on-ink.png`);
console.log("done — check", SCRATCH);
