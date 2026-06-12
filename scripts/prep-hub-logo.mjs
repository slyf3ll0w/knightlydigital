/**
 * One-shot prep for the Streamflaire Hub logo David supplied (PNG with a
 * baked-in checkerboard, no real alpha). Keys out the near-white background,
 * trims, and splits off the leaf mark for icon use.
 * Run: node scripts/prep-hub-logo.mjs
 */
import sharp from "sharp";

const SRC = "C:/Users/David Lessly/Downloads/Streamflaire Hub Logo.png";

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  // distance from white drives alpha: checker squares (~244-250) vanish,
  // ink (dark gray / brand green) stays opaque, edges ramp smoothly
  const dist = 255 - Math.min(r, g, b);
  const alpha = Math.max(0, Math.min(255, (dist - 14) * 2.4));
  out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = alpha;
}

const rgba = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
const buf = await rgba.png().toBuffer();
const trimmedBuf = await sharp(buf).trim().png().toBuffer();
const tMeta = await sharp(trimmedBuf).metadata();
console.log("logo:", tMeta.width, "x", tMeta.height);
await sharp(trimmedBuf).toFile("public/streamflaire-hub-logo.png");

// leaf mark = everything left of the first wide transparent gap
const t = await sharp(trimmedBuf).raw().toBuffer({ resolveWithObject: true });
const colHasInk = (x) => {
  for (let y = 0; y < t.info.height; y++) {
    if (t.data[(y * t.info.width + x) * 4 + 3] > 20) return true;
  }
  return false;
};
let runStart = -1;
for (let x = 0; x < t.info.width; x++) {
  if (!colHasInk(x)) {
    if (runStart === -1) runStart = x;
    if (x - runStart >= 10 && runStart > 30) {
      await sharp(trimmedBuf)
        .extract({ left: 0, top: 0, width: runStart, height: t.info.height })
        .trim().png().toFile("public/streamflaire-hub-mark.png");
      const m = await sharp("public/streamflaire-hub-mark.png").metadata();
      console.log("mark ends at x =", runStart, "→", m.width, "x", m.height);
      process.exit(0);
    }
  } else {
    runStart = -1;
  }
}
console.log("no gap found — mark not extracted");
