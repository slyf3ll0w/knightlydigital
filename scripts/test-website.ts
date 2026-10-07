/**
 * Unit tests for the client-websites brief + rebuild rules.
 *   npx tsx scripts/test-website.ts
 * Needs a placeholder DATABASE_URL (lib/website imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import { sanitizeBrief, briefGaps, publicBrief, safeUrl, emptyBrief } from "../lib/website-brief";
import { companyWriteTouchesSite, websiteWriteTouchesSite, SITE_MODELS } from "../lib/website";

// ── websiteWriteTouchesSite (the rebuild loop, audit 2026-10-06) ─────────────
{
  assert.equal(websiteWriteTouchesSite({ rebuildQueuedAt: new Date(), rebuildReason: "x", rebuildError: null }), false, "rebuild bookkeeping is not a site change");
  assert.equal(websiteWriteTouchesSite({ rebuildQueuedAt: new Date(), rebuildSentAt: new Date() }), false);
  assert.equal(websiteWriteTouchesSite({ status: "LIVE" }), true, "a status change is");
  assert.equal(websiteWriteTouchesSite({ rebuildQueuedAt: new Date(), direction: "warm" }), true, "mixed write counts");
  assert.equal(websiteWriteTouchesSite(undefined), true, "no data (delete) counts");
  assert.equal(websiteWriteTouchesSite({}), true);
}

// ── sanitizeBrief ────────────────────────────────────────────────────────────
{
  const b = sanitizeBrief(null);
  assert.deepEqual(b, emptyBrief(), "null → empty brief");
}
{
  const b = sanitizeBrief({
    tagline: "  Honest air  ",
    story: "x".repeat(5000),
    foundedYear: "2009",
    licenses: ["TACLA 1", "tacla 1", "", 42, "TACLA 2"],
    insured: "yes",
    serviceAreas: ["Allen", "Plano"],
    differentiators: ["a", "b", "c", "d", "e", "f", "g"],
    tone: ["warm", "shouty", "premium"],
    likedSites: ["example.com", "javascript:alert(1)", "https://good.example/path/"],
    googleBusinessUrl: "maps.app.goo.gl/abc",
    socials: { facebook: "facebook.com/harlow", tiktok: "not a url", bogus: "x" },
    faqs: [{ q: "Do you charge?", a: "No." }, { q: "", a: "nope" }, { q: "Only q" }],
    showPrices: 1,
  });
  assert.equal(b.tagline, "Honest air");
  assert.equal(b.story.length, 3000, "story capped");
  assert.equal(b.foundedYear, 2009);
  assert.deepEqual(b.licenses, ["TACLA 1", "TACLA 2"], "dedupes case-insensitively, drops junk");
  assert.equal(b.insured, false, "only a real boolean true");
  assert.equal(b.differentiators.length, 5);
  assert.deepEqual(b.tone, ["warm", "premium"], "unknown tone words dropped");
  assert.deepEqual(b.likedSites, ["https://example.com", "https://good.example/path"], "javascript: dropped, scheme added, trailing slash trimmed");
  assert.equal(b.googleBusinessUrl, "https://maps.app.goo.gl/abc");
  assert.equal(b.socials.facebook, "https://facebook.com/harlow");
  assert.equal(b.socials.tiktok, "", "non-URL social dropped");
  assert.equal((b.socials as Record<string, unknown>).bogus, undefined);
  assert.deepEqual(b.faqs, [{ q: "Do you charge?", a: "No." }], "a FAQ needs both halves");
  assert.equal(b.showPrices, false);
}
{
  assert.equal(sanitizeBrief({ foundedYear: 1800 }).foundedYear, null, "too early");
  assert.equal(sanitizeBrief({ foundedYear: new Date().getFullYear() + 1 }).foundedYear, null, "future");
}

// ── safeUrl ──────────────────────────────────────────────────────────────────
assert.equal(safeUrl("ftp://x.com"), "");
assert.equal(safeUrl("localhost"), "", "needs a dot");
assert.equal(safeUrl(" https://A.com/B "), "https://a.com/B");

// ── briefGaps ────────────────────────────────────────────────────────────────
{
  const gaps = briefGaps(emptyBrief(), 0).map((g) => g.key);
  assert.deepEqual(gaps, ["story", "serviceAreas", "differentiators", "tone", "photos"]);
  const full = sanitizeBrief({ story: "s", serviceAreas: ["Allen"], differentiators: ["x"], tone: ["warm"] });
  assert.deepEqual(briefGaps(full, 1), []);
}

// ── publicBrief ──────────────────────────────────────────────────────────────
{
  const b = publicBrief(sanitizeBrief({ likedSites: ["https://a.com"], dislikes: "pop-ups", story: "s" }));
  assert.deepEqual(b.likedSites, []);
  assert.equal(b.dislikes, "");
  assert.equal(b.story, "s");
}

// ── rebuild triggers ─────────────────────────────────────────────────────────
assert.equal(companyWriteTouchesSite({ businessHours: {} }), true);
assert.equal(companyWriteTouchesSite({ phone: "x", atlasTokens: 1 }), true);
assert.equal(companyWriteTouchesSite({ atlasTokens: 1 }), false, "counters never rebuild");
assert.equal(companyWriteTouchesSite(undefined), false);
assert.ok(SITE_MODELS.has("Website") && SITE_MODELS.has("BookingType") && !SITE_MODELS.has("Contact"));

console.log("test-website: ok");
