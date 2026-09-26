// npx tsx scripts/test-ds-theme.ts — the design-system brand tokens (lib/ds-theme.ts).
import assert from "node:assert/strict";
import { contrastRatio } from "../lib/branding";
import { dsBrandVars, readableOn, DS_DEFAULT_PRIMARY } from "../lib/ds-theme";

const ok = (m: string) => console.log("  ok " + m);

// defaults = WorkBench blue/orange, untouched on light
const d = dsBrandVars(null, null);
assert.equal(d["--ds-primary-l"], DS_DEFAULT_PRIMARY);
assert.equal(d["--ds-on-primary-l"], "#ffffff");
ok("unbranded company gets WorkBench blue");

// every token clears 3:1 on its surface, for awkward brands
for (const brand of ["#FFE600", "#FFFFFF", "#000000", "#22C55E", "#8B5CF6", "#0B57D8"]) {
  const v = dsBrandVars(brand, brand);
  for (const k of ["primary", "secondary"]) {
    assert.ok((contrastRatio(v[`--ds-${k}-l`], "#FFFFFF") ?? 0) >= 3, `${brand} ${k} light`);
    assert.ok((contrastRatio(v[`--ds-${k}-d`], "#161D2B") ?? 0) >= 3, `${brand} ${k} dark`);
  }
}
ok("yellow, white, black, green, violet all readable on light and dark");

// a readable brand is left alone; a pale one keeps its hue family (darkened, not replaced)
assert.equal(readableOn("#0B57D8", "light"), "#0B57D8");
const yellow = readableOn("#FFE600", "light");
assert.notEqual(yellow, "#0A1328");
ok("readable colors untouched, pale ones darkened rather than swapped");

// garbage input falls back
assert.equal(dsBrandVars("not-a-color", "")["--ds-primary-l"], DS_DEFAULT_PRIMARY);
ok("invalid hex falls back to the defaults");

// brand font rides along
assert.match(dsBrandVars(null, null, "Poppins")["--ds-font"], /^"Poppins", "Lexend"/);
ok("brand font overrides Lexend");
console.log("test-ds-theme: all assertions passed");
