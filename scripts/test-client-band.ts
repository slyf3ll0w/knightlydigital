/**
 * The heavy band on client surfaces (lib/client-band.ts): which color the
 * portal header and client emails wear, and that its text always reads.
 *   npx tsx scripts/test-client-band.ts
 */
import assert from "node:assert/strict";
import { clientBand } from "../lib/client-band";
import { contrastRatio } from "../lib/branding";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const brands: Record<string, { brandColor: string | null; brandColorSecondary: string | null; documentColor?: string | null }> = {
  navy: { brandColor: "#0A1428", brandColorSecondary: "#F86808" },
  orange: { brandColor: "#F97316", brandColorSecondary: null },
  yellow: { brandColor: "#FDE047", brandColorSecondary: null },
  white: { brandColor: "#FFFFFF", brandColorSecondary: "#FFFFFF" },
  none: { brandColor: null, brandColorSecondary: null },
  black: { brandColor: "#111111", brandColorSecondary: "#FFFFFF" },
};

test("the band is the company color; white or missing falls back to WorkBench blue", () => {
  assert.equal(clientBand(brands.navy).band, "#0A1428");
  assert.equal(clientBand(brands.orange).band, "#F97316");
  assert.equal(clientBand(brands.yellow).band, "#FDE047");
  assert.equal(clientBand(brands.white).band, "#0B57D8");
  assert.equal(clientBand(brands.none).band, "#0B57D8");
  assert.equal(clientBand({ ...brands.navy, documentColor: "#7C3AED" }).band, "#7C3AED");
});

test("band text flips: white on dark, ink on pale", () => {
  assert.equal(clientBand(brands.navy).onBand, "#FFFFFF");
  assert.equal(clientBand(brands.none).onBand, "#FFFFFF");
  assert.equal(clientBand(brands.yellow).onBand, "#0A1428");
  for (const [k, b] of Object.entries(brands)) {
    const c = clientBand(b);
    assert.ok((contrastRatio(c.onBand, c.band) ?? 0) >= 3, `${k}: band text reads (3:1)`);
  }
});

test("the button reads on white and its label reads on the button", () => {
  for (const [k, b] of Object.entries(brands)) {
    const c = clientBand(b);
    assert.ok((contrastRatio(c.accent, "#FFFFFF") ?? 0) >= 3, `${k}: button on white`);
    assert.ok((contrastRatio(c.onAccent, c.accent) ?? 0) >= 3, `${k}: button label`);
  }
});

console.log(`\n${passed} client-band tests passed`);
