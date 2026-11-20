/**
 * AI page designer — the theme spec v1 rules (lib/client-theme-spec.ts) and
 * the root attributes the client pages wear (lib/client-theme-style.ts).
 * Pure: npx tsx scripts/test-client-theme-spec.ts
 */
import assert from "node:assert/strict";
import {
  COPY_LIMITS,
  CONTRAST,
  DEFAULT_THEME,
  PORTAL_SECTIONS,
  THEME_FONTS,
  THEME_SPEC_MAX_BYTES,
  accentPasses,
  bandPasses,
  cleanCopy,
  groundPasses,
  mergeThemePatch,
  nearestPassing,
  orderBookingItems,
  parseClientTheme,
  photoBandPasses,
  portalSectionOrder,
  resolveTheme,
  themeBookingItem,
  themeSpecGuide,
  type ThemeContext,
} from "../lib/client-theme-spec";
import { cssUrl, themeRoot, themedBand } from "../lib/client-theme-style";
import { clientBand } from "../lib/client-band";
import { contrastRatio } from "../lib/branding";
import { FIXTURE_THEMES, fixtureBookingItems, fixtureThemeContext } from "../lib/client-fixtures";

const ctx: ThemeContext = { bookingItemIds: ["bt_mow", "bt_est", "bt_call"], assetIds: ["th_crew", "th_yard"], defaultBand: "#0B57D8" };
const parse = (raw: unknown) => parseClientTheme(raw, ctx);
const paths = (raw: unknown) => parse(raw).problems.map((p) => p.path);
const ok = (raw: unknown, msg?: string) => {
  const r = parse(raw);
  assert.deepEqual(r.problems, [], msg ?? JSON.stringify(raw));
  return r.theme;
};

// ── The plan's example spec passes as written (ids swapped for this context) ──
const example = {
  v: 1,
  colors: { band: "#14532D", accent: "#B45309", ground: "#F4F6F2" },
  font: "Archivo",
  logo: { size: "lg", placement: "band-left" },
  band: { style: "photo", imageId: "th_crew", overlay: 0.55 },
  buttons: "solid",
  corners: "soft",
  portal: { sections: ["balance", "todo", "comingUp", "requestWork", "completedWork", "records"], welcome: "Everything for your project, in one place." },
  login: { layout: "split", imageId: "th_yard", heading: "Sign in to your project" },
  booking: {
    hero: "photo-left",
    items: [{ id: "bt_mow", show: true }, { id: "bt_est", show: true }, { id: "bt_call", show: false }],
    heading: "Book your free estimate",
    line: "Licensed and insured in Collin County since 2009.",
    thankYou: "Thanks! We'll text you within the hour.",
  },
  itemWords: { bt_mow: { description: "Weekly mowing, edging and blowing.", button: "Pick a time" } },
};
const ex = ok(example);
assert.equal(ex.colors?.band, "#14532D");
assert.equal(ex.band?.style, "photo");
assert.deepEqual(ex.booking?.items?.[2], { id: "bt_call", show: false });
// The JSON text form parses the same
assert.deepEqual(parse(JSON.stringify(example)).theme, ex);

// ── Fatal: not an object, bad JSON, wrong version, too big → empty spec ──
for (const bad of [null, 42, "nope", "[1]", [], { v: 2 }]) {
  const r = parse(bad);
  assert.equal(r.ok, false, JSON.stringify(bad));
  assert.ok(r.problems[0].fatal, JSON.stringify(bad));
  assert.deepEqual(r.theme, { v: 1 });
}
const huge = { v: 1, portal: { welcome: "x".repeat(THEME_SPEC_MAX_BYTES) } };
assert.ok(parse(huge).problems[0].fatal, "over 8 KB is refused whole");
assert.match(parse(huge).problems[0].message, /8192/);
assert.ok(parse(JSON.stringify(huge)).problems[0].fatal, "over 8 KB as text too");
assert.deepEqual(parse({}).theme, { v: 1 }, "v may be left out");

// ── Unknown keys are dropped and named ──
const unk = parse({ v: 1, css: "body{}", html: "<b>", colors: { band: "#14532D", text: "#000000" }, consent: "x" });
assert.deepEqual(unk.ignored.sort(), ["colors.text", "consent", "css", "html"]);
assert.equal((unk.theme as Record<string, unknown>).css, undefined);
assert.equal(unk.ok, true, "ignored keys are not problems");

// ── Colors: #RRGGBB only ──
for (const c of ["red", "#FFF", "rgb(0,0,0)", "#12345G", 123]) assert.deepEqual(paths({ colors: { accent: c } }), ["colors.accent"], String(c));
assert.equal(ok({ colors: { accent: "#b45309" } }).colors?.accent, "#B45309", "hex is upper-cased");

// Band: ink (white / near-black as clientBand picks it) ≥ 4.5:1
assert.equal(bandPasses("#14532D"), true, "dark green, white ink");
assert.equal(bandPasses("#FDE047"), true, "pale yellow, dark ink");
const midBand = parse({ colors: { band: "#2E8BE6" } }); // white ink ~3.6:1
assert.deepEqual(midBand.problems.map((p) => p.path), ["colors.band"]);
const mb = midBand.problems[0];
assert.ok(mb.ratio! < CONTRAST.bandInk && mb.ratio! >= 3, "ratio reported");
assert.equal(mb.needed, CONTRAST.bandInk);
assert.ok(mb.suggestion && bandPasses(mb.suggestion), "the suggestion passes");
assert.match(mb.message, /nearest color that passes is #[0-9A-F]{6}/);
assert.equal(midBand.theme.colors, undefined, "a failing color is left out, never shifted silently");
assert.deepEqual(paths({ colors: { band: "#FFFFFF" } }), ["colors.band"], "white makes no band");
assert.deepEqual(paths({ colors: { band: "#FBFBFB" } }), ["colors.band"], "near-white makes no band");

// Accent: ≥ 3:1 on white AND its button text ≥ 4.5:1
assert.equal(accentPasses("#B45309"), true);
assert.equal(accentPasses("#111111"), true);
const pale = parse({ colors: { accent: "#FDE047" } }); // pale yellow button: blocked with a darker suggestion
assert.deepEqual(pale.problems.map((p) => p.path), ["colors.accent"]);
assert.ok(pale.problems[0].ratio! < CONTRAST.accentOnWhite);
assert.ok(pale.problems[0].suggestion && accentPasses(pale.problems[0].suggestion), "test recipe 2: the suggestion passes");
assert.deepEqual(paths({ colors: { accent: pale.problems[0].suggestion } }), []);
// 3:1 on white but the best text on it < 4.5
const mid = nearestPassing("#FDE047", (c) => (contrastRatio(c, "#FFFFFF") ?? 0) >= 3)!;
if (!accentPasses(mid)) assert.match(parse({ colors: { accent: mid } }).problems[0].message, /button text/);

// Ground: body ink ≥ 7:1, so near-white only
assert.equal(groundPasses("#F4F6F2"), true);
assert.equal(groundPasses("#FFFFFF"), true);
const g = parse({ colors: { ground: "#8899AA" } });
assert.deepEqual(g.problems.map((p) => p.path), ["colors.ground"]);
assert.ok(g.problems[0].suggestion && groundPasses(g.problems[0].suggestion));
assert.ok(g.problems[0].needed === CONTRAST.groundInk);

// nearestPassing walks both ways and returns the color itself when it passes
assert.equal(nearestPassing("#14532D", bandPasses), "#14532D");
assert.equal(nearestPassing("#123456", () => false), null);

// ── Font: the list only, case-insensitive, canonical name kept ──
assert.equal(ok({ font: "archivo" }).font, "Archivo");
assert.equal(ok({ font: "Space Grotesk" }).font, "Space Grotesk");
assert.deepEqual(paths({ font: "Comic Sans MS" }), ["font"]);
assert.deepEqual(paths({ font: "https://fonts.example/x.woff" }), ["font"], "no font URLs");
assert.ok(THEME_FONTS.length >= 25 && THEME_FONTS.length <= 35, "about thirty fonts");
assert.equal(new Set(THEME_FONTS).size, THEME_FONTS.length);

// ── Enums ──
assert.deepEqual(paths({ logo: { size: "xl", placement: "band-right" } }), ["logo.size", "logo.placement"]);
assert.deepEqual(paths({ band: { style: "video" } }), ["band.style"]);
assert.deepEqual(paths({ buttons: "outline-on-hover-solid" }), ["buttons"]);
assert.deepEqual(paths({ corners: "round" }), []);
assert.deepEqual(paths({ corners: "rounder" }), ["corners"]);
assert.deepEqual(paths({ login: { layout: "modal" } }), ["login.layout"]);
assert.deepEqual(paths({ booking: { hero: "video" } }), ["booking.hero"]);
assert.match(parse({ buttons: "x" }).problems[0].message, /solid, outline, pill/);

// ── Images: this company's ThemeAsset ids only (no URLs) ──
assert.deepEqual(paths({ band: { imageId: "https://evil.example/a.png" } }), ["band.imageId"]);
assert.deepEqual(paths({ band: { imageId: "th_other_company" } }), ["band.imageId"]);
assert.deepEqual(paths({ band: { style: "photo" } }), ["band.style"], "photo needs a photo");
assert.deepEqual(paths({ login: { layout: "split" } }), ["login.layout"], "split needs a photo");
assert.deepEqual(paths({ login: { layout: "photo-full", imageId: "nope" } }), ["login.imageId"]);
assert.deepEqual(paths({ booking: { hero: "photo-left" } }), ["booking.hero"], "the hero uses the band photo");
assert.deepEqual(paths({ band: { imageId: "th_crew" }, booking: { hero: "photo-behind" } }), []);
assert.deepEqual(paths({ login: { layout: "band-top" } }), [], "band-top needs no photo");
// Overlay 0–0.7
for (const o of [-0.1, 0.71, 1, "0.5", NaN]) assert.deepEqual(paths({ band: { overlay: o } }), ["band.overlay"], String(o));
assert.equal(ok({ band: { overlay: 0.7 } }).band?.overlay, 0.7);
// Band ink against the overlay floor: a pale overlay on a bright photo fails, with the overlay that works
const thin = parse({ colors: { band: "#14532D" }, band: { style: "photo", imageId: "th_crew", overlay: 0.1 } });
assert.deepEqual(thin.problems.map((p) => p.path), ["band.overlay"]);
assert.match(thin.problems[0].message, /Use overlay 0\.\d+ or more/);
const need = Number(/Use overlay (0\.\d+)/.exec(thin.problems[0].message)![1]);
assert.ok(photoBandPasses("#14532D", need) && !photoBandPasses("#14532D", 0.1));
assert.equal(thin.theme.band?.style, undefined, "the photo style is left out until it passes");
assert.equal(thin.theme.band?.imageId, "th_crew", "the rest of the band is kept");
// A band no overlay can save gets another color suggested
const weak = parse({ colors: { band: "#1D4ED8" }, band: { style: "photo", imageId: "th_crew", overlay: 0.1 } });
assert.equal(weak.problems.length, 1);
// Photo band over the company's own band color when colors.band is unset
assert.equal(parse({ band: { style: "photo", imageId: "th_crew", overlay: 0.7 } }).ok, photoBandPasses("#0B57D8", 0.7));

// ── Portal sections: subset + order; balance then todo always first ──
assert.deepEqual(ok({ portal: { sections: ["balance", "todo", "records"] } }).portal?.sections, ["balance", "todo", "records"], "hide everything optional");
assert.deepEqual(paths({ portal: { sections: ["todo", "balance", "records"] } }), ["portal.sections"], "can't move todo above balance");
assert.deepEqual(paths({ portal: { sections: ["comingUp", "balance", "todo"] } }), ["portal.sections"], "test recipe 6: Coming up above Balance due");
assert.deepEqual(paths({ portal: { sections: ["todo", "records"] } }), ["portal.sections"], "test recipe 6: can't hide Balance due");
assert.deepEqual(paths({ portal: { sections: ["balance", "records"] } }), ["portal.sections"], "can't hide the to-do cards (they carry new messages)");
assert.deepEqual(paths({ portal: { sections: ["balance", "todo", "photos"] } }), ["portal.sections"], "unknown id");
assert.deepEqual(paths({ portal: { sections: ["balance", "todo", "records", "records"] } }), ["portal.sections"], "duplicate");
assert.deepEqual(paths({ portal: { sections: "balance" } }), ["portal.sections"]);
assert.deepEqual(portalSectionOrder(resolveTheme({ v: 1, portal: { sections: ["balance", "todo", "agreements", "comingUp"] } })), ["balance", "todo", "agreements", "comingUp"]);
assert.deepEqual(portalSectionOrder(resolveTheme(null)), [...PORTAL_SECTIONS], "default = today's order");
// portalSectionOrder pins even a hand-made resolved theme
assert.deepEqual(portalSectionOrder({ portal: { sections: ["records", "comingUp"], welcome: null } }), ["balance", "todo", "records", "comingUp"]);

// ── Booking items: this company's ids, no repeats, at least one shown ──
assert.deepEqual(paths({ booking: { items: [{ id: "bt_other", show: true }] } }), ["booking.items[0].id"]);
assert.deepEqual(paths({ booking: { items: [{ id: "bt_mow" }, { id: "bt_mow" }] } }), ["booking.items[1].id"]);
assert.deepEqual(paths({ booking: { items: [{ id: "bt_mow", show: "no" }] } }), ["booking.items[0].show"]);
assert.deepEqual(paths({ booking: { items: ["bt_mow"] } }), ["booking.items[0]"]);
assert.deepEqual(paths({ booking: { items: [{ id: "bt_mow", show: false }, { id: "bt_est", show: false }, { id: "bt_call", show: false }] } }), ["booking.items"], "can't hide every item");
assert.deepEqual(ok({ booking: { items: [{ id: "bt_call" }] } }).booking?.items, [{ id: "bt_call", show: true }], "show defaults to true");
// Menu order: listed first in order, hidden dropped, the rest after in their own order
const menu = [{ id: "bt_mow" }, { id: "bt_est" }, { id: "bt_call" }, { id: "bt_new" }];
const ordered = orderBookingItems(menu, resolveTheme({ v: 1, booking: { items: [{ id: "bt_call", show: true }, { id: "bt_mow", show: false }] } }));
assert.deepEqual(ordered.map((t) => t.id), ["bt_call", "bt_est", "bt_new"], "test recipe 7");
assert.deepEqual(orderBookingItems(menu, resolveTheme(null)).map((t) => t.id), menu.map((t) => t.id));

// ── Copy: plain text, caps, no links / emails / phones / markup ──
assert.deepEqual(cleanCopy("  Hello\nthere  ", 60), { text: "Hello there", problem: null }, "newlines stripped");
assert.deepEqual(cleanCopy("", 60), { text: null, problem: null });
assert.deepEqual(cleanCopy(null, 60), { text: null, problem: null });
for (const bad of [
  "Call 555-1234 to book", // test recipe 12
  "Call (469) 555-0142",
  "Text +1 469 555 0142",
  "Visit www.example.com",
  "See https://evil.example",
  "We're at bestlawn.com",
  "Email us at a@b.co",
  "<script>alert(1)</script>",
  "Hi {name}",
]) {
  const r = parse({ portal: { welcome: bad } });
  assert.deepEqual(r.problems.map((p) => p.path), ["portal.welcome"], bad);
  assert.equal(r.theme.portal, undefined, bad);
}
assert.match(parse({ portal: { welcome: "Call 555-1234 to book" } }).problems[0].message, /phone number/);
assert.match(parse({ portal: { welcome: "www.x.com" } }).problems[0].message, /link/);
assert.match(parse({ portal: { welcome: "a@b.co" } }).problems[0].message, /email/);
ok({ portal: { welcome: "Since 2009. Licensed, insured, 5 stars." } }, "ordinary numbers are fine");
ok({ booking: { line: "Open 7 days, 8-5." } });
const caps: [string, number, (t: string) => unknown][] = [
  ["login.heading", COPY_LIMITS.heading, (t) => ({ login: { heading: t } })],
  ["booking.heading", COPY_LIMITS.heading, (t) => ({ booking: { heading: t } })],
  ["portal.welcome", COPY_LIMITS.welcome, (t) => ({ portal: { welcome: t } })],
  ["booking.line", COPY_LIMITS.line, (t) => ({ booking: { line: t } })],
  ["booking.thankYou", COPY_LIMITS.thankYou, (t) => ({ booking: { thankYou: t } })],
  ["itemWords.bt_mow.description", COPY_LIMITS.itemDescription, (t) => ({ itemWords: { bt_mow: { description: t } } })],
  ["itemWords.bt_mow.button", COPY_LIMITS.button, (t) => ({ itemWords: { bt_mow: { button: t } } })],
];
for (const [path, max, make] of caps) {
  assert.deepEqual(paths(make("a".repeat(max))), [], `${path} at the cap`);
  assert.deepEqual(paths(make("a".repeat(max + 1))), [path], `${path} over the cap`);
}
assert.deepEqual([COPY_LIMITS.heading, COPY_LIMITS.welcome, COPY_LIMITS.line, COPY_LIMITS.itemDescription, COPY_LIMITS.button, COPY_LIMITS.thankYou], [60, 160, 160, 200, 24, 200]);
// itemWords: this company's items only
assert.deepEqual(paths({ itemWords: { bt_other: { button: "Go" } } }), ["itemWords.bt_other"]);
assert.deepEqual(parse({ itemWords: { bt_mow: { button: "Go", heading: "X" } } }).ignored, ["itemWords.bt_mow.heading"]);

// ── Pieces fail one at a time; the rest stays ──
const mixed = parse({ colors: { band: "#14532D", accent: "#FDE047" }, corners: "soft", portal: { welcome: "Call 555-1234" } });
assert.deepEqual(mixed.problems.map((p) => p.path).sort(), ["colors.accent", "portal.welcome"]);
assert.deepEqual(mixed.theme, { v: 1, colors: { band: "#14532D" }, corners: "soft" });

// ── mergeThemePatch: objects merge, lists replace, null resets ──
const draft = { v: 1, colors: { band: "#14532D", accent: "#B45309" }, portal: { sections: ["balance", "todo", "records"], welcome: "Hi" } };
const merged = mergeThemePatch(draft, { colors: { accent: "#111111" }, portal: { sections: ["balance", "todo"] }, corners: "square" });
assert.deepEqual(merged, { v: 1, colors: { band: "#14532D", accent: "#111111" }, portal: { sections: ["balance", "todo"], welcome: "Hi" }, corners: "square" });
assert.deepEqual(mergeThemePatch(draft, { colors: { band: null }, portal: null }), { v: 1, colors: { accent: "#B45309" } });
assert.deepEqual(mergeThemePatch(null, { font: "Archivo" }), { v: 1, font: "Archivo" });
assert.deepEqual(mergeThemePatch(draft, "junk"), draft);
assert.equal(draft.colors.accent, "#B45309", "the draft is not mutated");
assert.deepEqual(mergeThemePatch({ v: 1, itemWords: { bt_mow: { button: "A" } } }, { itemWords: { bt_mow: { description: "D" } } }), {
  v: 1,
  itemWords: { bt_mow: { button: "A", description: "D" } },
});

// ── resolveTheme: null = today's look; everything defaulted ──
const d = resolveTheme(null);
assert.equal(d.isDefault, true);
assert.deepEqual(d, JSON.parse(JSON.stringify(DEFAULT_THEME)));
d.portal.sections.pop();
assert.equal(resolveTheme(null).portal.sections.length, PORTAL_SECTIONS.length, "callers get a copy");
assert.equal(resolveTheme({ v: 1 }).isDefault, true, "an empty spec is the default look");
assert.equal(resolveTheme({ v: 1, corners: "round", buttons: "solid" }).isDefault, true, "spelling out the defaults is still the default");
const r1 = resolveTheme(parse(example).theme, { imageUrl: (id) => `/api/theme-assets/c1/${id}` });
assert.equal(r1.isDefault, false);
assert.equal(r1.band.style, "photo");
assert.equal(r1.band.imageUrl, "/api/theme-assets/c1/th_crew");
assert.equal(r1.login.layout, "split");
assert.equal(r1.booking.hero, "photo-left");
assert.equal(r1.logo.size, "lg");
// No way to load the photo = the plain version of each photo piece
const r2 = resolveTheme(parse(example).theme);
assert.deepEqual([r2.band.style, r2.login.layout, r2.booking.hero], ["solid", "band-top", "plain"]);

// ── themeBookingItem: words for display; questions, fields and consent untouched ──
const item = { id: "bt_mow", description: "Own words", buttonLabel: "Request", intake: { done: { heading: "", body: "", note: "" }, fields: ["email"] } };
const tItem = themeBookingItem(item, r1);
assert.equal(tItem.description, "Weekly mowing, edging and blowing.");
assert.equal(tItem.buttonLabel, "Pick a time");
assert.equal(tItem.intake.done.body, "Thanks! We'll text you within the hour.", "the thank-you fills a blank done message");
assert.equal(tItem.intake.fields, item.intake.fields);
const own = themeBookingItem({ ...item, id: "bt_est", intake: { ...item.intake, done: { heading: "", body: "Bring your gate code.", note: "" } } }, r1);
assert.equal(own.intake.done.body, "Bring your gate code.", "an item's own thank-you wins");
assert.equal(own.description, "Own words", "no itemWords = the item's own words");
assert.equal(themeBookingItem(item, resolveTheme(null)), item, "default theme = the same object");
assert.equal(themeBookingItem(item, null), item);

// ── themeRoot / themedBand: the default theme adds nothing ──
const b = clientBand({ brandColor: "#0A1428", brandColorSecondary: "#F86808" });
assert.deepEqual(themeRoot(resolveTheme(null), b), { attrs: {}, vars: {}, fontHref: null });
assert.deepEqual(themeRoot(null, b), { attrs: {}, vars: {}, fontHref: null });
assert.equal(themedBand(b, resolveTheme(null)), b);
const tb = themedBand(b, r1);
assert.equal(tb.band, "#14532D");
assert.equal(tb.accent, "#B45309");
assert.ok((contrastRatio(tb.onBand, tb.band) ?? 0) >= CONTRAST.bandInk);
assert.ok((contrastRatio(tb.onAccent, tb.accent) ?? 0) >= CONTRAST.buttonText);
const root = themeRoot(resolveTheme(parse(example).theme, { imageUrl: (id) => `/api/theme-assets/c1/${id}` }), tb);
assert.equal(root.attrs["data-ch-corners"], "soft");
assert.equal(root.attrs["data-ch-band"], "photo");
assert.equal(root.attrs["data-ch-logo"], "lg");
assert.ok("data-ch-display" in root.attrs);
assert.equal(root.vars["--ch-ground"], "#F4F6F2");
assert.match(root.vars["--ch-band-fill"], /url\("\/api\/theme-assets\/c1\/th_crew"\)/);
assert.match(root.fontHref ?? "", /family=Archivo:wght@400;600;700/);
// Embeds: no band, no ground (the host website's), no logo
const emb = themeRoot(r1, tb, { surface: "embed" });
assert.equal(emb.attrs["data-ch-band"], undefined);
assert.equal(emb.vars["--ch-ground"], undefined);
assert.equal(emb.attrs["data-ch-corners"], "soft");
// The dark booking look keeps its dark ground
assert.equal(themeRoot(r1, tb, { dark: true }).vars["--ch-ground"], undefined);
// Outline buttons carry a text color readable on white (4.5:1)
const outline = themeRoot(resolveTheme({ v: 1, buttons: "outline", colors: { accent: "#B45309" } }), tb);
assert.ok((contrastRatio(outline.vars["--ch-accent-text"], "#FFFFFF") ?? 0) >= 4.5);
// Gradient end keeps the band ink readable (it only moves away from the ink)
const grad = themeRoot(resolveTheme({ v: 1, band: { style: "gradient" } }), tb);
assert.match(grad.vars["--ch-band-fill"], /^linear-gradient\(135deg, #14532D 0%, #[0-9A-F]{6} 100%\)$/);
// cssUrl: our own paths and data: images only
assert.equal(cssUrl("/api/theme-assets/c/a"), 'url("/api/theme-assets/c/a")');
assert.equal(cssUrl("https://evil.example/x.png"), null);
assert.equal(cssUrl('/x") ; background: red'), null);
assert.equal(cssUrl("javascript:alert(1)"), null);

// ── The fixture themes (/client-preview?theme=fixture:<name>) are valid ──
for (const [name, spec] of Object.entries(FIXTURE_THEMES)) {
  const r = parseClientTheme(spec, fixtureThemeContext());
  assert.deepEqual(r.problems, [], `fixture ${name}`);
  assert.deepEqual(r.ignored, [], `fixture ${name}`);
}
assert.ok(fixtureBookingItems().every((t) => fixtureThemeContext().bookingItemIds.includes(t.id)));

// ── The guide the AI tools hand out names every enum ──
const guide = themeSpecGuide();
assert.equal(guide.fonts.length, THEME_FONTS.length);
assert.deepEqual(guide.portalSections.filter((s) => s.pinned).map((s) => s.id), ["balance", "todo"]);

console.log("test-client-theme-spec: ok");
