/**
 * AI page designer — the LOCKED pieces stay out of the theme's reach
 * (docs/plans/ai-portal-designer-2026-11-20.md → "What is themeable and what
 * is locked"). Render-free: it proves the locked pieces are not theme inputs.
 * Phase 6 adds the render test (each form under every fixture theme, the
 * consent text / required fields / address step / captcha / Built with
 * WorkBench compared in the DOM).
 *   npx tsx scripts/test-client-theme-locked.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { effectiveIntake } from "../lib/booking-intake";
import { smsConsentLabel } from "../lib/sms-consent";
import { parseClientTheme, resolveTheme, themeBookingItem } from "../lib/client-theme-spec";
import { FIXTURE_THEMES, FIXTURE_THEME_PHOTOS, fixtureBookingItems, fixtureRequestItem, fixtureThemeContext } from "../lib/client-fixtures";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const THEME_IMPORT = /lib\/client-theme-(spec|load|style)|client-theme\.css/;

function walk(dir: string): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : /\.(tsx?|css)$/.test(e.name) ? [rel] : [];
  });
}

// 1 · Surfaces that never read the theme: quote, pay, emails, and the locked pieces themselves
const neverThemed = [
  ...walk("app/quote"),
  ...walk("app/pay"),
  "lib/email.ts",
  "lib/sms-consent.ts",
  "app/embed/[slug]/EmbedBuiltWith.tsx",
  "app/embed/[slug]/layout.tsx",
  "app/portal/[slug]/PortalLoginForm.tsx",
  "app/book/[slug]/LegalPage.tsx",
  ...walk("app/book/[slug]/privacy"),
  ...walk("app/book/[slug]/sms-terms"),
  "lib/booking-intake.ts",
];
assert.ok(neverThemed.length > 12, "found the quote + pay pages");
for (const f of neverThemed) {
  assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
  assert.doesNotMatch(read(f), THEME_IMPORT, `${f} must never read the page-designer theme`);
}

// 2 · "Built with WorkBench" takes only the slug and sits OUTSIDE the themed embed shell
assert.match(read("app/embed/[slug]/EmbedBuiltWith.tsx"), /export default function EmbedBuiltWith\(\{ slug \}: \{ slug: string \}\)/);
const embedLayout = read("app/embed/[slug]/layout.tsx");
assert.match(embedLayout, /\{children\}\s*<EmbedBuiltWith slug=\{slug\} \/>/, "rendered by the layout after the page, not inside EmbedScheduleShell");

// 3 · The SMS consent wording has one input: the business name
assert.equal(smsConsentLabel.length, 1);
const label = smsConsentLabel("Brightwire Electric");
for (const spec of Object.values(FIXTURE_THEMES)) {
  void spec;
  assert.equal(smsConsentLabel("Brightwire Electric"), label);
}

// 4 · Locked things can't be smuggled into a spec: dropped as unknown keys
const sneaky = parseClientTheme(
  {
    v: 1,
    consent: "You agree to everything",
    smsConsent: "x",
    requiredFields: [],
    captcha: false,
    honeypot: false,
    builtWith: false,
    css: "body{display:none}",
    html: "<script>",
    script: "alert(1)",
    fontUrl: "https://fonts.example/x.css",
    booking: { questions: [], address: false, payment: "none" },
    login: { wording: "Enter your password" },
  },
  fixtureThemeContext()
);
assert.deepEqual(
  sneaky.ignored.sort(),
  ["booking.address", "booking.payment", "booking.questions", "builtWith", "captcha", "consent", "css", "fontUrl", "honeypot", "html", "login.wording", "requiredFields", "script", "smsConsent"].sort()
);
assert.deepEqual(sneaky.theme, { v: 1 });

// 5 · Under every fixture theme, each item's questions, required fields, address step and
//     kind/mode rules are exactly the item's own: only display words (description, button,
//     a blank thank-you) change
const items = [...fixtureBookingItems(), fixtureRequestItem()];
for (const [name, spec] of Object.entries(FIXTURE_THEMES)) {
  const parsed = parseClientTheme(spec, fixtureThemeContext());
  assert.equal(parsed.ok, true, name);
  const theme = resolveTheme(parsed.theme, { imageUrl: (id) => FIXTURE_THEME_PHOTOS[id] ?? null });
  for (const it of items) {
    const themed = themeBookingItem(it, theme);
    const { done: d1, ...rest1 } = it.intake;
    const { done: d2, ...rest2 } = themed.intake;
    assert.deepEqual(rest2, rest1, `${name} / ${it.id}: intake untouched`);
    assert.equal(d2.heading, d1.heading, `${name} / ${it.id}: done heading untouched`);
    assert.equal(d2.note, d1.note, `${name} / ${it.id}: done note untouched`);
    // Re-applying the kind/mode rules gives the same required fields and address step
    const { done: _e1, ...eff1 } = effectiveIntake(it.intake, { kind: it.kind, mode: it.mode });
    const { done: _e2, ...eff2 } = effectiveIntake(themed.intake, { kind: themed.kind, mode: themed.mode });
    void _e1;
    void _e2;
    assert.deepEqual(eff2, eff1, `${name} / ${it.id}: effective intake untouched`);
    for (const k of ["id", "slug", "kind", "mode", "heading", "needsAddress", "paymentMode", "confirmation", "services", "exactTime"] as const) {
      assert.deepEqual(themed[k], it[k], `${name} / ${it.id}: ${k} untouched`);
    }
  }
}

console.log("test-client-theme-locked: ok");
