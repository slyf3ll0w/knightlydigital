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
  defaultClientVisible,
  filterMatches,
  isPhotoStage,
  photoMapUrl,
  photoSrc,
  shouldStampLocation,
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

console.log("test-photos: ok");
