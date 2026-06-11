/**
 * Generates the JobFlow PWA icon set from the in-app logo mark
 * (green rounded square + dark briefcase, matching AppShell's logo).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";

// Lucide briefcase glyph (24x24 stroke icon), scaled onto the tile.
function tile(size, { radius, glyphScale }) {
  const s = (size / 24) * glyphScale;
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#22C55E"/>
  <g transform="translate(${size / 2},${size / 2}) scale(${s}) translate(-12,-12)"
     fill="none" stroke="#0C0F0C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="14" x="2" y="6" rx="2"/>
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </g>
</svg>`);
}

await mkdir("public/pwa", { recursive: true });

// Standard icons: rounded tile, generous glyph
await sharp(tile(512, { radius: 112, glyphScale: 0.62 })).png().toFile("public/pwa/icon-512.png");
await sharp(tile(192, { radius: 42, glyphScale: 0.62 })).png().toFile("public/pwa/icon-192.png");
// Maskable: full-bleed square, glyph inside the 80% safe zone
await sharp(tile(512, { radius: 0, glyphScale: 0.5 })).png().toFile("public/pwa/icon-maskable-512.png");
// iOS home screen icon (Next serves app/apple-icon.png automatically)
await sharp(tile(180, { radius: 0, glyphScale: 0.58 })).png().toFile("app/apple-icon.png");

console.log("PWA icons written: public/pwa/icon-{192,512}.png, icon-maskable-512.png, app/apple-icon.png");
