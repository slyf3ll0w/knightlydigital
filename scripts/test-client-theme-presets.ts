/**
 * Settings → Client pages, the simple controls and the page's own Atlas
 * (lib/client-theme-presets.ts, lib/assistant/design-scope.ts).
 *   npx tsx scripts/test-client-theme-presets.ts
 */
import assert from "node:assert/strict";
import {
  STYLE_PRESETS,
  UNDO_LIMIT,
  applyStylePreset,
  designTurnsToSend,
  photoOn,
  readableOverlay,
  popUndo,
  pushUndo,
  setThemePhoto,
  stylePresetOf,
  type UndoStack,
} from "../lib/client-theme-presets";
import { parseClientTheme, type ClientThemeSpec } from "../lib/client-theme-spec";
import { DESIGN_SCOPE_TOOLS, designScopeStable, isAssistantScope } from "../lib/assistant/design-scope";
import { designTools } from "../lib/assistant/design";

const ctx = { bookingItemIds: ["item1"], assetIds: ["photo1", "photo2"], defaultBand: "#0B57D8" };

// ── Styles ──
assert.equal(STYLE_PRESETS.length, 3);
assert.equal(new Set(STYLE_PRESETS.map((p) => `${p.buttons}/${p.corners}`)).size, 3, "buttons + corners tell the styles apart (so a photo band can't confuse them)");
assert.equal(stylePresetOf({ v: 1 }), "clean", "the default look is Clean");
assert.equal(stylePresetOf(null), "clean");

const bold = applyStylePreset({ v: 1, colors: { band: "#123456" } }, "bold");
assert.deepEqual(bold, { v: 1, colors: { band: "#123456" }, corners: "square", band: { style: "gradient" } }, "Bold = solid buttons (default), square corners, gradient band; colors kept");
assert.equal(stylePresetOf(bold), "bold");
const soft = applyStylePreset(bold, "soft");
assert.deepEqual(soft, { v: 1, colors: { band: "#123456" }, buttons: "pill", band: { style: "gradient" } });
assert.equal(stylePresetOf(soft), "soft");
const clean = applyStylePreset(soft, "clean");
assert.deepEqual(clean, { v: 1, colors: { band: "#123456" } }, "Clean writes the defaults as nothing set");
assert.equal(stylePresetOf({ v: 1, buttons: "outline" }), null, "a mix from More options matches no style");
assert.equal(stylePresetOf({ v: 1, band: { style: "gradient" } }), null, "solid/round with a gradient band is not Clean");

const input: ClientThemeSpec = { v: 1, buttons: "pill" };
applyStylePreset(input, "bold");
assert.deepEqual(input, { v: 1, buttons: "pill" }, "never mutates its input");

for (const p of STYLE_PRESETS) {
  assert.equal(parseClientTheme(applyStylePreset({ v: 1 }, p.id), ctx).problems.length, 0, `${p.label} passes the theme checks`);
}

// ── Photo ──
assert.equal(photoOn({ v: 1 }), false);
const withPhoto = setThemePhoto({ v: 1 }, true, "photo1");
assert.deepEqual(withPhoto, { v: 1, band: { imageId: "photo1", style: "photo" }, booking: { hero: "photo-behind" } });
assert.equal(photoOn(withPhoto), true);
assert.equal(parseClientTheme(withPhoto, ctx).problems.some((p) => p.path === "band.overlay"), true, "without the band color the default layer can fail on a mid blue");
const readable = setThemePhoto({ v: 1 }, true, "photo1", ctx.defaultBand);
assert.equal(readable.band?.overlay, readableOverlay(ctx.defaultBand));
assert.ok(readable.band!.overlay! > 0.45 && readable.band!.overlay! <= 0.7);
assert.equal(parseClientTheme(readable, ctx).problems.length, 0, "with the band color the photo look passes");
assert.equal(setThemePhoto({ v: 1 }, true, "photo1", "#0A1428").band?.overlay, undefined, "a dark band keeps the default layer");
assert.equal(readableOverlay("#0A1428"), 0.45);
assert.deepEqual(setThemePhoto({ v: 1, booking: { hero: "photo-left" } }, true, "photo1").booking, { hero: "photo-left" }, "a photo layout picked under More options is kept");
assert.equal(stylePresetOf(withPhoto), "clean", "a photo band keeps the style it had");

const boldPhoto = setThemePhoto(applyStylePreset({ v: 1 }, "bold"), true, "photo2");
assert.equal(boldPhoto.band?.style, "photo");
assert.equal(stylePresetOf(boldPhoto), "bold");
const boldOff = setThemePhoto({ ...boldPhoto, band: { ...boldPhoto.band, overlay: 0.6 } }, false);
assert.deepEqual(boldOff.band, { imageId: "photo2", style: "gradient" }, "off: the style's band comes back, the photo is remembered, the overlay goes");
assert.equal(boldOff.booking, undefined, "off: the booking top goes back to plain");
assert.equal(photoOn(boldOff), false);
assert.deepEqual(setThemePhoto(boldOff, true).band, { imageId: "photo2", style: "photo" }, "on again with no new id uses the remembered photo");
assert.deepEqual(setThemePhoto(withPhoto, false, null), { v: 1 }, "removing the photo clears it entirely");
assert.deepEqual(setThemePhoto({ v: 1 }, true), { v: 1 }, "on with no photo yet changes nothing");
assert.equal(applyStylePreset(withPhoto, "soft").band?.style, "photo", "a style never turns the photo band off");

// ── Undo ──
let stack: UndoStack = [];
assert.equal(popUndo(stack), null, "nothing to undo");
const a: ClientThemeSpec = { v: 1 };
const b: ClientThemeSpec = { v: 1, colors: { band: "#111111" } };
stack = pushUndo(stack, a);
stack = pushUndo(stack, b);
stack = pushUndo(stack, b);
assert.equal(stack.length, 2, "the same draft twice in a row is one step");
b.colors!.band = "#999999";
const back = popUndo(stack)!;
assert.deepEqual(back.spec, { v: 1, colors: { band: "#111111" } }, "a later edit can't reach into the stack");
assert.equal(back.stack.length, 1);
assert.deepEqual(popUndo(back.stack)!.spec, { v: 1 });
let big: UndoStack = [];
for (let i = 0; i < UNDO_LIMIT + 5; i++) big = pushUndo(big, { v: 1, portal: { welcome: `n${i}` } });
assert.equal(big.length, UNDO_LIMIT, "the oldest fall off");
assert.equal(popUndo(big)!.spec.portal?.welcome, `n${UNDO_LIMIT + 4}`);

// ── The page's Atlas ──
assert.equal(isAssistantScope("client-pages"), true);
assert.equal(isAssistantScope("everything"), false);
assert.equal(isAssistantScope(undefined), false);
const designNames = designTools.map((t) => t.decl.name);
for (const n of DESIGN_SCOPE_TOOLS) assert.ok(designNames.includes(n), `${n} is a real design tool`);
assert.ok(!DESIGN_SCOPE_TOOLS.includes("publish_client_theme") && !DESIGN_SCOPE_TOOLS.includes("revert_client_theme"), "the page's Atlas never stages a publish: the person presses Publish");
const prompt = designScopeStable("Atlas", "Brightwire Electric");
assert.ok(prompt.includes("Publish") && prompt.includes("DRAFT"), "the prompt says drafts only, Publish is the person's");
assert.ok(/no links/i.test(prompt) && /phone numbers/.test(prompt), "copy rules are in the prompt");
assert.equal(designScopeStable("Atlas", "Brightwire Electric"), prompt, "stable part is stable (cache)");

const turns = designTurnsToSend([
  { role: "assistant", content: "Hi" },
  { role: "user", content: "make it green" },
  { role: "assistant", content: "Done", recap: "draft_client_theme → ok" },
  { role: "user", content: "darker" },
]);
assert.equal(turns[0].role, "user", "starts with the person's turn");
assert.equal(turns.length, 3);
assert.ok(turns[1].content.includes("[Behind this reply: draft_client_theme"), "the recap rides along");
const many = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `t${i}` }));
assert.ok(designTurnsToSend(many).length <= 8, "only the last few turns");

console.log("client-theme-presets: all checks passed");
