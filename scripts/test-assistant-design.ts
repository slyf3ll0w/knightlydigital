/**
 * The AI page designer's Atlas / connector tools (lib/assistant/design.ts):
 * the pure parts — tool arguments → spec patch, the card's plain lines, the
 * preview links — plus the declarations every tool must carry.
 * Run: npx tsx scripts/test-assistant-design.ts (placeholder DATABASE_URL; nothing is queried)
 */
import assert from "node:assert/strict";
import { designTools, describeTheme, previewLinks, themePatchFromArgs, DESIGN_GATE_NOTE } from "../lib/assistant/design";
import { mergeThemePatch, parseClientTheme } from "../lib/client-theme-spec";
import type { Actor } from "../lib/permissions";

// 1. arguments → patch
{
  const p = themePatchFromArgs({
    note: "Dark green",
    colors: { band: "#14532D" },
    font: "Archivo",
    bogus: 1,
    itemWords: [{ itemId: "bt_mow", description: "Weekly mowing.", button: "Pick a time" }, { itemId: "bt_est" }, { description: "no id" }, "junk"],
    clear: ["colors.accent", "booking.heading", "itemWords.bt_old", "band", "evil.key", "../x", "colors.a.b.c"],
  });
  assert.deepEqual(p.colors, { band: "#14532D", accent: null });
  assert.equal(p.font, "Archivo");
  assert.equal("bogus" in p, false, "only spec keys pass through");
  assert.equal("note" in p, false, "the note is not part of the spec");
  assert.deepEqual(p.itemWords, { bt_mow: { description: "Weekly mowing.", button: "Pick a time" }, bt_est: null, bt_old: null });
  assert.deepEqual(p.booking, { heading: null });
  assert.equal(p.band, null);
  assert.equal("evil" in p, false, "clear only touches spec keys");
  assert.deepEqual(themePatchFromArgs({}), {});
  console.log("ok 1: tool arguments become a spec patch; clear = null = back to the default");
}

// 2. the patch goes through the real merge + checks: a cleared piece is gone, a set piece is kept
{
  const draft = { v: 1, colors: { band: "#14532D", accent: "#1D4ED8" }, booking: { heading: "Book now" } };
  const merged = mergeThemePatch(draft, themePatchFromArgs({ clear: ["colors.accent", "booking.heading"], font: "Archivo" }));
  const parsed = parseClientTheme(merged, { bookingItemIds: [], assetIds: [] });
  assert.equal(parsed.theme.colors?.band, "#14532D");
  assert.equal(parsed.theme.colors?.accent, undefined);
  assert.equal(parsed.theme.booking?.heading, undefined);
  assert.equal(parsed.theme.font, "Archivo");
  console.log("ok 2: patches merge over the draft and pass the spec checks");
}

// 3. card lines
{
  assert.deepEqual(describeTheme(null), ["The default look: your logo and brand colors, nothing else changed"]);
  assert.deepEqual(describeTheme({ v: 1 }), ["The default look: your logo and brand colors, nothing else changed"]);
  const lines = describeTheme(
    {
      v: 1,
      colors: { band: "#14532D", accent: "#B45309" },
      font: "Archivo",
      logo: { size: "lg", placement: "band-left" },
      band: { style: "photo", imageId: "a1", overlay: 0.5 },
      buttons: "pill",
      corners: "soft",
      portal: { sections: ["balance", "todo", "comingUp", "records"], welcome: "Hi there." },
      login: { layout: "split" },
      booking: { hero: "photo-left", heading: "Book your estimate", items: [{ id: "i1", show: true }, { id: "i2", show: false }] },
      itemWords: { i1: { button: "Go" } },
    },
    { i1: "Mowing", i2: "Phone call" }
  );
  const text = lines.join("\n");
  for (const want of ["band #14532D", "buttons #B45309", "Archivo", "large", "50% shade", "pill buttons", "soft corners", "hidden: Request work", "Agreements", '"Hi there."', "photo beside the form", "photo beside the heading", '"Book your estimate"', "Mowing (hidden from the menu: Phone call)", "Own words on: Mowing"]) {
    assert.ok(text.includes(want), `card lines mention ${want}\n${text}`);
  }
  assert.ok(!text.includes("i2"), "item ids never show on a card");
  console.log("ok 3: a theme reads as plain card lines");
}

// 4. preview links
{
  const l = previewLinks("tok_1");
  assert.ok(l.portal.endsWith("/client-preview?theme=tok_1&doc=hub"));
  assert.ok(l.login.endsWith("doc=login") && l.booking.endsWith("doc=book") && l.form.endsWith("doc=form"));
  console.log("ok 4: preview links per surface");
}

// 5. the four tools: names, manager-only, one job each, a plain gate note
{
  const names = designTools.map((t) => t.decl.name).sort();
  assert.deepEqual(names, ["draft_client_theme", "get_client_theme", "publish_client_theme", "revert_client_theme"]);
  const base = { id: "u1", name: "T", companyId: "c1", salesSeePayments: true };
  for (const t of designTools) {
    assert.equal(t.allowed({ ...base, role: "OWNER" } as Actor), true, `${t.decl.name} for owners`);
    assert.equal(t.allowed({ ...base, role: "TECH" } as Actor), false, `${t.decl.name} not for techs`);
    assert.equal(t.allowed({ ...base, role: "SALES" } as Actor), false, `${t.decl.name} not for sales`);
    assert.ok(!("action" in ((t.decl.parameters as { properties?: Record<string, unknown> })?.properties ?? {})), `${t.decl.name} has no action switch`);
  }
  assert.ok(!/<|http/.test(DESIGN_GATE_NOTE) && DESIGN_GATE_NOTE.includes("Pro"));
  console.log("ok 5: four manager-only tools, one job each");
}

console.log("assistant-design: all assertions passed");
