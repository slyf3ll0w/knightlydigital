/**
 * lib/photos-shared.ts — stages, defaults and filters for the Gallery plan.
 *   npx tsx scripts/test-photos.ts
 */
import assert from "node:assert/strict";
import {
  FRESH_SHOT_MS,
  JOB_STAGE_OPTIONS,
  PHOTO_LIMITS,
  PHOTO_STAGES,
  QUOTE_STAGE,
  STAGE_LABEL,
  clientMaySee,
  defaultClientVisible,
  filterMatches,
  hubPhotoSrc,
  isPhotoStage,
  nextBeforeToMatch,
  pairable,
  pairsOf,
  photoMapUrl,
  photoSrc,
  reportPath,
  reportPhotos,
  reportSummaryLine,
  shouldStampLocation,
  suggestPairs,
  unpaired,
  type PhotoView,
} from "../lib/photos-shared";
import { galleryPreviewOpen } from "../lib/gallery-preview";

// ── Stages ──
assert.deepEqual([...PHOTO_STAGES], ["ESTIMATE", "BEFORE", "DURING", "AFTER", "GENERAL"]);
assert.equal(isPhotoStage("AFTER"), true);
assert.equal(isPhotoStage("after"), false);
assert.equal(isPhotoStage(null), false);
assert.equal(QUOTE_STAGE, "ESTIMATE");
// The job picker never offers Estimate — that is the quote's stage.
assert.ok(!JOB_STAGE_OPTIONS.some((o) => o.value === "ESTIMATE"));
assert.ok(JOB_STAGE_OPTIONS.some((o) => o.value === "DURING"));
assert.equal(STAGE_LABEL.GENERAL, "", "a plain photo carries no pill");
for (const s of PHOTO_STAGES) if (s !== "GENERAL") assert.ok(STAGE_LABEL[s].length > 0, s);

// ── Client visibility default (decision 4, 2026-10-30): After shown, the rest hidden ──
assert.equal(defaultClientVisible("AFTER"), true);
for (const s of ["ESTIMATE", "BEFORE", "DURING", "GENERAL"] as const) assert.equal(defaultClientVisible(s), false, s);

// ── Filters: Before includes the estimate photos that rode over from the quote ──
assert.equal(filterMatches("ALL", "DURING"), true);
assert.equal(filterMatches("BEFORE", "BEFORE"), true);
assert.equal(filterMatches("BEFORE", "ESTIMATE"), true);
assert.equal(filterMatches("BEFORE", "AFTER"), false);
assert.equal(filterMatches("AFTER", "AFTER"), true);
assert.equal(filterMatches("AFTER", "GENERAL"), false);

// ── Location only for a fresh shot ──
const now = new Date("2026-10-30T15:00:00Z");
assert.equal(shouldStampLocation(now, now), true);
assert.equal(shouldStampLocation(new Date(now.getTime() - FRESH_SHOT_MS + 1000), now), true);
assert.equal(shouldStampLocation(new Date(now.getTime() - FRESH_SHOT_MS - 1000), now), false, "a library pick from an hour ago is not 'here'");

// ── URLs ──
assert.equal(photoSrc("abc"), "/api/job-photos/abc");
assert.equal(photoSrc("abc", "thumb"), "/api/job-photos/abc?size=thumb");
assert.equal(photoMapUrl(32.96125, -96.65975), "https://maps.google.com/?q=32.961250,-96.659750");

// ── Limits the uploader and the route agree on ──
assert.equal(PHOTO_LIMITS.perTarget, 100);
assert.ok(PHOTO_LIMITS.maxThumbBytes < PHOTO_LIMITS.maxBytes);
assert.ok(PHOTO_LIMITS.perPick >= 5);

// ── Preview switch: test accounts only, until GALLERY_OPEN=1 ──
assert.equal(galleryPreviewOpen({ isTest: true }, {}), true);
assert.equal(galleryPreviewOpen({ isTest: false }, {}), false);
assert.equal(galleryPreviewOpen({ isTest: null }, {}), false);
assert.equal(galleryPreviewOpen({ isTest: false }, { GALLERY_OPEN: "1" }), true);
assert.equal(galleryPreviewOpen({ isTest: false }, { GALLERY_OPEN: "0" }), false);

// ── Pairs (phase B) ──
const t0 = Date.parse("2026-10-30T15:00:00Z");
const mk = (id: string, stage: PhotoView["stage"], minutes: number, extra: Partial<PhotoView> = {}): PhotoView => ({
  id,
  stage,
  caption: null,
  takenAt: new Date(t0 + minutes * 60_000).toISOString(),
  createdAt: new Date(t0 + minutes * 60_000).toISOString(),
  by: "Tech",
  lat: null,
  lng: null,
  clientVisible: defaultClientVisible(stage),
  siteUse: false,
  alt: null,
  hasThumb: true,
  jobId: "job1",
  quoteId: null,
  pairId: null,
  ...extra,
});
const b1 = mk("b1", "BEFORE", 0);
const b2 = mk("b2", "ESTIMATE", 1); // an estimate photo counts as a before
const d1 = mk("d1", "DURING", 5);
const a1 = mk("a1", "AFTER", 10);
const a2 = mk("a2", "AFTER", 11);
const a3 = mk("a3", "AFTER", 12);
const g1 = mk("g1", "GENERAL", 13);

// pairable: one before-ish + one after, same job, neither taken
assert.equal(pairable(b1, a1).ok, true);
assert.equal(pairable(a1, b2).ok, true, "order doesn't matter; estimate is a before");
assert.equal(pairable(b1, b2).ok, false, "two befores");
assert.equal(pairable(a1, a2).ok, false, "two afters");
assert.equal(pairable(d1, a1).ok, false, "during is neither side");
assert.equal(pairable(b1, { ...a1, jobId: "job2" }).ok, false, "different jobs");
assert.equal(pairable(b1, { ...a1, jobId: null }).ok, false, "a quote-only photo has no job");
assert.equal(pairable({ ...b1, pairId: "p9" }, a1).ok, false, "already paired elsewhere");
assert.equal(pairable({ ...b1, pairId: "p9" }, { ...a1, pairId: "p9" }).ok, true, "re-affirming the same pair is fine");
assert.equal(pairable(b1, b1).ok, false);

// suggestPairs: shooting order, befores × afters, leftovers stay loose
const all = [b1, b2, d1, a1, a2, a3, g1];
assert.deepEqual(suggestPairs(all), [
  ["b1", "a1"],
  ["b2", "a2"],
]);
assert.equal(nextBeforeToMatch(all)?.id, "b1");
assert.deepEqual(suggestPairs([a1, a2]), [], "nothing to match without a before");

// pairsOf / unpaired: a pairId needs one of each to count
const paired = [{ ...b1, pairId: "p1" }, b2, d1, { ...a1, pairId: "p1" }, a2, { ...a3, pairId: "lonely" }];
const pairs = pairsOf(paired);
assert.equal(pairs.length, 1);
assert.equal(pairs[0].before.id, "b1");
assert.equal(pairs[0].after.id, "a1");
const loose = unpaired(paired);
assert.deepEqual(loose.befores.map((p) => p.id), ["b2"]);
assert.deepEqual(loose.afters.map((p) => p.id), ["a2", "a3"], "a half-pair is still loose");
assert.equal(nextBeforeToMatch(paired)?.id, "b2");
assert.deepEqual(suggestPairs(paired), [["b2", "a2"]]);

// ── Report photos: pairs ride on the After's visibility; hidden singles never leave ──
const rep = reportPhotos([
  { ...b1, pairId: "p1" }, // hidden before, but its after is shown → in the pair
  { ...a1, pairId: "p1" },
  { ...b2, pairId: "p2" },
  { ...a2, pairId: "p2", clientVisible: false }, // after hidden → whole pair stays home
  a3, // visible single
  d1, // hidden single
  { ...g1, clientVisible: true },
]);
assert.deepEqual(rep.pairs.map((p) => p.id), ["p1"]);
assert.deepEqual(rep.singles.map((p) => p.id), ["a3", "g1"]);
assert.equal(clientMaySee({ ...b1, pairId: "p1" }, [{ ...a1, pairId: "p1" }]), true);
assert.equal(clientMaySee({ ...b2, pairId: "p2" }, [{ ...a2, pairId: "p2", clientVisible: false }]), false);
assert.equal(clientMaySee(d1, []), false);
assert.equal(clientMaySee(a3, []), true);

// ── Words and links ──
assert.equal(reportSummaryLine({ pairs: 2, singles: 4, checklist: 3 }), "2 before-and-after comparisons, 4 photos and the 3-item checklist");
assert.equal(reportSummaryLine({ pairs: 1, singles: 0, checklist: 0 }), "1 before-and-after comparison");
assert.equal(reportSummaryLine({ pairs: 0, singles: 1, checklist: 0 }), "1 photo");
assert.equal(reportSummaryLine({ pairs: 0, singles: 0, checklist: 0 }), "");
assert.equal(reportPath("tok", "job1"), "/hub/tok/work/job1");
assert.equal(hubPhotoSrc("tok", "a1"), "/hub/tok/photos/a1");
assert.equal(hubPhotoSrc("tok", "a1", "thumb"), "/hub/tok/photos/a1?size=thumb");

console.log("test-photos: ok");
