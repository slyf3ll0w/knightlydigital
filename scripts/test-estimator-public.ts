/**
 * Website-form config for estimate tools (lib/estimator-public.ts). Pure.
 * Run: npx tsx scripts/test-estimator-public.ts
 */
import assert from "node:assert";
import {
  defaultPublicConfig,
  sanitizePublicConfig,
  publicSlugFrom,
  PUBLIC_SLUG_RE,
  estimateRange,
  friendlyRound,
  shapeEstimate,
  estimateLabel,
  describePublicConfig,
  defaultButtonLabel,
  defaultSuccessMessage,
  shapeVariants,
} from "../lib/estimator-public";
import { MONTHLY_LIMITS, monthlyLabel, monthlyPayment } from "../lib/estimator-public";

// 1. defaults + sanitize
{
  const d = sanitizePublicConfig(null);
  assert.deepEqual(d, defaultPublicConfig(), "null column reads as defaults");
  assert.equal(d.showPrice, "exact");
  assert.equal(d.onSubmit, "draft");
  assert.equal(d.fields.email.required, true, "email required by default");
  assert.ok(d.disclaimer.length > 20, "default disclaimer");

  const c = sanitizePublicConfig({ showPrice: "range", rangePct: 200, reveal: "after_contact", onSubmit: "send", heading: " Instant price ", intro: "x".repeat(1000) });
  assert.equal(c.rangePct, 50, "range percent clamps to the max");
  assert.equal(c.reveal, "after_contact");
  assert.equal(c.onSubmit, "send");
  assert.equal(c.heading, "Instant price", "trimmed");
  assert.equal(c.intro.length, 300, "intro capped");
  assert.equal(sanitizePublicConfig({ rangePct: 1 }).rangePct, 5, "range percent clamps to the min");
  assert.equal(sanitizePublicConfig({ rangePct: "abc" }).rangePct, 15, "bad percent → default");

  const h = sanitizePublicConfig({ showPrice: "hidden", onSubmit: "send" });
  assert.equal(h.onSubmit, "draft", "hidden price can't email a quote the visitor never saw");

  const noContact = sanitizePublicConfig({ fields: { email: { show: false }, phone: { show: false } } });
  assert.equal(noContact.fields.email.show, true, "a form must be able to reach someone");
  assert.equal(noContact.fields.email.required, true);

  const phoneOnly = sanitizePublicConfig({ fields: { email: { show: false }, phone: { show: true, required: false } } });
  assert.equal(phoneOnly.fields.phone.required, true, "at least one contact detail is required");

  const bothOptional = sanitizePublicConfig({ fields: { email: { show: true, required: false }, phone: { show: true, required: false } } });
  assert.equal(bothOptional.fields.email.required, true, "email becomes required when nothing else is");

  const hiddenReq = sanitizePublicConfig({ fields: { address: { show: false, required: true } } });
  assert.equal(hiddenReq.fields.address.required, false, "a hidden field can't be required");

  const msg = sanitizePublicConfig({ fields: { message: { show: true, label: "Tell us more" } } });
  assert.equal(msg.fields.message.label, "Tell us more");
  assert.equal(sanitizePublicConfig({ fields: { message: { label: "" } } }).fields.message.label, "Anything else we should know?");
  assert.equal(sanitizePublicConfig({ disclaimer: "" }).disclaimer, "", "the owner may clear the disclaimer on purpose");
}

// 2. slugs
{
  assert.equal(publicSlugFrom("Driveway & house wash"), "driveway-and-house-wash");
  assert.equal(publicSlugFrom("  Interior Paint (by room)! "), "interior-paint-by-room");
  assert.equal(publicSlugFrom("!!!"), "");
  assert.ok(PUBLIC_SLUG_RE.test(publicSlugFrom("Lawn mowing — weekly")));
  assert.ok(!PUBLIC_SLUG_RE.test("-bad"));
  assert.ok(publicSlugFrom("x".repeat(200)).length <= 50);
}

// 3. ranges
{
  assert.equal(friendlyRound(437, "down"), 430);
  assert.equal(friendlyRound(437, "up"), 440);
  assert.equal(friendlyRound(1237, "down"), 1225);
  assert.equal(friendlyRound(5432, "up"), 5450);
  assert.equal(friendlyRound(12345, "down"), 12300);
  const r = estimateRange(1000, 15);
  assert.equal(r.low, 850);
  assert.equal(r.high, 1150);
  const withMin = estimateRange(160, 15, 150);
  assert.equal(withMin.low, 150, "low never drops under the job minimum");
  assert.ok(withMin.high >= 160);
  const tiny = estimateRange(12, 50);
  assert.ok(tiny.low >= 0 && tiny.high >= tiny.low);
}

// 4. shaping the estimate for the visitor
{
  const result = {
    lines: [
      { name: "Driveway cleaning", description: "800 sq ft", quantity: 800, unitPrice: 0.25, isOptional: false },
      { name: "Sealant", description: "", quantity: 800, unitPrice: 0.45, isOptional: true },
    ],
    subtotal: 200,
    title: "Pressure washing — 800 sq ft",
  };
  const exact = shapeEstimate(result, { showPrice: "exact", rangePct: 15 });
  assert.equal(exact.mode, "exact");
  if (exact.mode === "exact") {
    assert.equal(exact.lines.length, 2);
    assert.equal(exact.lines[0].total, 200);
    assert.equal(exact.lines[1].total, 360);
    assert.equal(exact.subtotal, 200);
    assert.equal(estimateLabel(exact), "$200.00");
  }
  const range = shapeEstimate(result, { showPrice: "range", rangePct: 10 }, 150);
  assert.equal(range.mode, "range");
  if (range.mode === "range") {
    assert.equal(range.low, 180);
    assert.equal(range.high, 220);
    assert.equal(estimateLabel(range), "$180 – $220");
    assert.ok(!("lines" in range), "a range never carries the lines");
  }
  const hidden = shapeEstimate(result, { showPrice: "hidden", rangePct: 15 });
  assert.equal(hidden.mode, "hidden");
  assert.equal(estimateLabel(hidden), "");
  assert.ok(!("subtotal" in hidden), "hidden carries no number at all");
}

// 5. words
{
  const d = defaultPublicConfig();
  const lines = describePublicConfig(d);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /exact estimate/);
  assert.match(lines[1], /name, email, phone \(optional\)/);
  assert.match(lines[2], /draft quote/);
  assert.match(describePublicConfig({ ...d, showPrice: "range", rangePct: 20 })[0], /±20%/);
  assert.match(describePublicConfig({ ...d, showPrice: "hidden" })[0], /no price/);
  assert.equal(defaultButtonLabel(d), "See my estimate");
  assert.equal(defaultButtonLabel({ ...d, reveal: "after_contact" }), "Get my quote");
  assert.equal(defaultButtonLabel({ ...d, showPrice: "hidden" }), "Get my quote", "no price → no 'see my estimate'");
  assert.equal(defaultButtonLabel({ ...d, buttonLabel: "Price it" }), "Price it");
  assert.match(defaultSuccessMessage({ ...d, onSubmit: "send" }, "Acme"), /on its way/);
  assert.match(defaultSuccessMessage(d, "Acme"), /Acme will review/);
  assert.equal(defaultSuccessMessage({ ...d, successMessage: "Cheers!" }, "Acme"), "Cheers!");
}


// 6. photo fill-in flag (Batch 4) — off unless the owner says so; described when on
{
  assert.equal(sanitizePublicConfig(null).photoAssist, false);
  assert.equal(sanitizePublicConfig({ photoAssist: "true" }).photoAssist, true);
  assert.equal(sanitizePublicConfig({ photoAssist: 1 }).photoAssist, false, "only true/\"true\" turn it on");
  const on = sanitizePublicConfig({ photoAssist: true });
  assert.equal(describePublicConfig(on).length, 4);
  assert.ok(/photo/.test(describePublicConfig(on)[3]));
  assert.equal(describePublicConfig(sanitizePublicConfig(null)).length, 3);
}
console.log("ok 6: photoAssist");

console.log("test-estimator-public: all green");

// 8. package tiers shaped for the visitor (Batch 6)
{
  const raw = { basic: 250, plus: 345, premium: null };
  const exact = shapeVariants(raw, { showPrice: "exact", rangePct: 15 });
  assert.equal(exact.basic?.label, "$250");
  assert.equal(exact.premium, null, "a tier that can't price yet stays null");
  const range = shapeVariants(raw, { showPrice: "range", rangePct: 20 }, 240);
  assert.equal(range.basic?.label, "$240 – $300", "low never drops under the minimum");
  assert.ok(/^\$[\d,]+ – \$[\d,]+$/.test(range.plus?.label ?? ""), range.plus?.label);
  const hidden = shapeVariants(raw, { showPrice: "hidden", rangePct: 15 });
  assert.equal(hidden.basic, null);
  const grouped = shapeEstimate({ lines: [{ name: "A", description: "", quantity: 1, unitPrice: 10, isOptional: false, group: "Labor" }], subtotal: 10 }, { showPrice: "exact", rangePct: 15 });
  assert.ok(grouped.mode === "exact" && grouped.lines[0].group === "Labor", "groups reach the visitor's breakdown");
}
console.log("ok 8: shapeVariants + groups");

// 9. monthly payment (Batch 11) — off by default, clamped, never understated, folded into tier labels
{
  const d = sanitizePublicConfig(null);
  assert.equal(d.monthly.show, false);
  assert.equal(d.monthly.apr, 9.99);
  assert.equal(d.monthly.months, 60);
  const on = sanitizePublicConfig({ monthly: { show: "true", apr: 99, months: 1 } });
  assert.equal(on.monthly.show, true);
  assert.equal(on.monthly.apr, MONTHLY_LIMITS.aprMax, "APR clamps to the ceiling");
  assert.equal(on.monthly.months, MONTHLY_LIMITS.monthsMin, "term clamps to the floor");
  assert.equal(monthlyPayment(1200, 0, 12), 100, "0% APR is total ÷ months");
  assert.equal(monthlyPayment(2500, 9.99, 60), 54, "amortised and rounded up");
  assert.equal(monthlyPayment(0, 9.99, 60), 0);
  assert.equal(monthlyLabel(2500, d.monthly), "", "hidden unless the owner turns it on");
  assert.equal(monthlyLabel(2500, { show: true, apr: 9.99, months: 60 }), "about $54/mo");
  assert.equal(monthlyLabel(100, { show: true, apr: 9.99, months: 60 }), "", "too small to bother a visitor with");
  const tiers = shapeVariants({ basic: 2500, plus: null }, { showPrice: "exact", rangePct: 15, monthly: { show: true, apr: 9.99, months: 60 } });
  assert.equal(tiers.basic?.label, "$2,500");
  assert.equal(tiers.basic?.monthly, "about $54/mo");
  assert.equal(tiers.plus, null);
  const ranged = shapeVariants({ basic: 2500 }, { showPrice: "range", rangePct: 20, monthly: { show: true, apr: 9.99, months: 60 } });
  assert.ok(/^about \$\d+\/mo$/.test(ranged.basic?.monthly ?? ""), "range mode quotes the low end");
  assert.ok(/monthly payment/.test(describePublicConfig(sanitizePublicConfig({ monthly: { show: true } })).join("\n")));
}
console.log("ok 9: monthly payment");
