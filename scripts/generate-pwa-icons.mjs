/**
 * Generates the Streamflaire Hub PWA icon set: the leaf mark
 * (public/streamflaire-hub-mark.png, produced by prep-hub-logo.mjs)
 * centered on the dark brand tile.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

const MARK = "public/streamflaire-hub-mark.png";

async function tile(size, { radius, markScale }, outFile) {
  const markWidth = Math.round(size * markScale);
  const mark = await sharp(MARK).resize({ width: markWidth }).png().toBuffer();
  const markMeta = await sharp(mark).metadata();
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" fill="#0C0F0C"/>
    </svg>`
  );
  await sharp(bg)
    .composite([
      {
        input: mark,
        left: Math.round((size - markMeta.width) / 2),
        top: Math.round((size - markMeta.height) / 2),
      },
    ])
    .png()
    .toFile(outFile);
}

await mkdir("public/pwa", { recursive: true });

// Standard icons: rounded tile, generous mark
await tile(512, { radius: 112, markScale: 0.66 }, "public/pwa/icon-512.png");
await tile(192, { radius: 42, markScale: 0.66 }, "public/pwa/icon-192.png");
// Maskable: full-bleed square, mark inside the 80% safe zone
await tile(512, { radius: 0, markScale: 0.54 }, "public/pwa/icon-maskable-512.png");
// iOS home screen icon (Next serves app/apple-icon.png automatically)
await tile(180, { radius: 0, markScale: 0.6 }, "app/apple-icon.png");

console.log("PWA icons written: public/pwa/icon-{192,512}.png, icon-maskable-512.png, app/apple-icon.png");
