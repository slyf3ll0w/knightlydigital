/**
 * Page-designer photos (lib/client-theme-assets.ts): what counts as a photo,
 * the size limits, the ids, and that the re-encode really is a clean WebP.
 *   npx tsx scripts/test-client-theme-assets.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  THEME_ASSET,
  ThemeAssetError,
  checkUploadSize,
  isThemeAssetId,
  newThemeAssetId,
  reencodeThemeImage,
  sniffImageType,
  specAssetIds,
  themeAssetKey,
  typeRefusal,
} from "../lib/client-theme-assets";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const b = (...xs: number[]) => new Uint8Array(xs);
const s = (text: string) => new Uint8Array(Buffer.from(text, "utf8"));

async function main() {
  await test("magic bytes name the raster types", () => {
    assert.equal(sniffImageType(b(0xff, 0xd8, 0xff, 0xe0, 0, 0)), "jpeg");
    assert.equal(sniffImageType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "png");
    assert.equal(sniffImageType(s("GIF89a......")), "gif");
    assert.equal(sniffImageType(s("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "webp");
    assert.equal(sniffImageType(s("\u0000\u0000\u0000\u001cftypavif")), "avif");
    assert.equal(sniffImageType(s("\u0000\u0000\u0000\u0018ftypheic")), "heic");
  });

  await test("SVG, PDF and junk are not photos, whatever their name says", () => {
    assert.equal(sniffImageType(s("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), "svg");
    assert.equal(sniffImageType(s("﻿  \n<?xml version='1.0'?><svg/>")), "svg");
    assert.equal(sniffImageType(s("<!-- hi --><svg></svg>")), "svg");
    assert.equal(sniffImageType(s("%PDF-1.7\n")), "pdf");
    assert.equal(sniffImageType(s("<html><script>alert(1)</script>")), "unknown");
    assert.equal(sniffImageType(b()), "unknown");
    assert.equal(sniffImageType(b(0xff, 0xd8)), "unknown");
    // a PNG signature with a broken tail is not a PNG
    assert.equal(sniffImageType(b(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0)), "unknown");
  });

  await test("only decodable rasters pass; each refusal says what to do", () => {
    for (const t of ["jpeg", "png", "gif", "webp", "avif"] as const) assert.equal(typeRefusal(t), null);
    assert.match(typeRefusal("svg")!, /SVG/);
    assert.match(typeRefusal("pdf")!, /PDF/);
    assert.match(typeRefusal("heic")!, /HEIC/);
    assert.match(typeRefusal("unknown")!, /JPG, PNG or WebP/);
  });

  await test("size limits", () => {
    assert.ok(checkUploadSize(0));
    assert.equal(checkUploadSize(1), null);
    assert.equal(checkUploadSize(THEME_ASSET.maxInputBytes), null);
    assert.ok(checkUploadSize(THEME_ASSET.maxInputBytes + 1));
    assert.equal(THEME_ASSET.maxOutputBytes, 2 * 1024 * 1024);
    assert.equal(THEME_ASSET.maxEdge, 2400);
  });

  await test("ids and keys", () => {
    const id = newThemeAssetId();
    assert.ok(isThemeAssetId(id), id);
    assert.notEqual(id, newThemeAssetId());
    assert.ok(!isThemeAssetId("th_../../etc"));
    assert.ok(!isThemeAssetId("cl123"));
    assert.ok(!isThemeAssetId(`${id}x`));
    assert.equal(themeAssetKey("co1", id), `themes/co1/${id}.webp`);
  });

  await test("the photos a spec uses: band + login, once each", () => {
    assert.deepEqual(specAssetIds(null), []);
    assert.deepEqual(specAssetIds({ v: 1 }), []);
    assert.deepEqual(specAssetIds({ band: { imageId: "th_a" }, login: { imageId: "th_b" } }), ["th_a", "th_b"]);
    assert.deepEqual(specAssetIds({ band: { imageId: "th_a" }, login: { imageId: "th_a" } }), ["th_a"]);
    assert.deepEqual(specAssetIds({ band: { imageId: 5 } }), []);
  });

  await test("re-encode: a big JPEG with EXIF comes out a WebP, ≤2400 px, no metadata", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 30, g: 90, b: 60 } } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "secret-owner", Artist: "gps-person" } } })
      .toBuffer();
    assert.equal(sniffImageType(big), "jpeg");
    const out = await reencodeThemeImage(big);
    assert.equal(sniffImageType(out.data), "webp");
    assert.equal(out.width, 2400);
    assert.equal(out.height, 1800);
    assert.ok(out.data.byteLength <= THEME_ASSET.maxOutputBytes);
    const meta = await sharp(out.data).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
    assert.ok(!out.data.includes(Buffer.from("secret-owner")));
  });

  await test("re-encode: EXIF rotation is applied (sides swap)", async () => {
    const tall = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#336699" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await reencodeThemeImage(tall);
    assert.equal(out.width, 400);
    assert.equal(out.height, 800);
  });

  await test("re-encode: small photos aren't blown up, tiny ones are refused", async () => {
    const mid = await sharp({ create: { width: 900, height: 600, channels: 4, background: "#ff000080" } }).png().toBuffer();
    const out = await reencodeThemeImage(mid);
    assert.equal(out.width, 900);
    const tiny = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#000" } }).png().toBuffer();
    await assert.rejects(reencodeThemeImage(tiny), (e: unknown) => e instanceof ThemeAssetError && e.code === "TOO_SMALL");
  });

  await test("re-encode: a corrupt file is a plain refusal, not a crash", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await assert.rejects(reencodeThemeImage(broken), (e: unknown) => e instanceof ThemeAssetError && e.code === "BAD_IMAGE");
  });

  console.log(`\n${passed} client-theme-assets tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
