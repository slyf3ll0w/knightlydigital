import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { deleteObject, isBlobStorageConfigured, putObject } from "@/lib/blob-storage";
import { limit } from "@/lib/rate-limit";
import { THEME_LIMITS, getThemeState } from "@/lib/client-theme-store";
import { themeAssetUrl } from "@/lib/client-theme-load";

/**
 * Photos for the page designer (docs/plans/ai-portal-designer-2026-11-20.md,
 * phase 5): the band photo, the booking hero and the login background.
 *
 * Every upload is DECODED AND RE-ENCODED to WebP on the server (sharp), so
 * what we store and serve is plain pixels: no SVG, no script, no EXIF/GPS,
 * no colour-profile tricks. Only raster images are accepted, judged by their
 * first bytes rather than the name or the browser's type. Stored in R2 at
 * themes/<companyId>/<id>.webp and served by
 * app/api/theme-assets/[companyId]/[assetId] (themeAssetUrl).
 *
 * The pure pieces (sniffImageType, checkUploadSize, isThemeAssetId,
 * themeAssetKey, specAssetIds, reencodeThemeImage) are unit-tested in
 * scripts/test-client-theme-assets.ts.
 */

export const THEME_ASSET = {
  /** What a phone hands us. Bigger than this is not a photo anyone needs. */
  maxInputBytes: 15 * 1024 * 1024,
  /** After the re-encode. */
  maxOutputBytes: 2 * 1024 * 1024,
  /** Long edge after the re-encode. */
  maxEdge: 2400,
  /** Too small to fill a band without looking like mush. */
  minEdge: 200,
  /** Decoding bomb guard (an 8000 x 7500 photo fits). */
  maxInputPixels: 60_000_000,
  /** Photos a company can keep in its library. */
  maxPerCompany: 50,
} as const;

export type SniffedType = "jpeg" | "png" | "gif" | "webp" | "avif" | "heic" | "svg" | "pdf" | "unknown";

export class ThemeAssetError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "BAD_TYPE" | "TOO_BIG" | "TOO_SMALL" | "EMPTY" | "RATE_LIMITED" | "LIBRARY_FULL" | "NOT_FOUND" | "IN_USE" | "UNAVAILABLE" | "BAD_IMAGE"
  ) {
    super(message);
    this.name = "ThemeAssetError";
  }
}

/** The raster types we decode. HEIC is sniffed only to give a clear refusal. */
const ACCEPTED: ReadonlySet<SniffedType> = new Set(["jpeg", "png", "gif", "webp", "avif"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < Math.min(end, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** What the file really is, from its first bytes. Pure. */
export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return "gif";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heic";
    return "unknown";
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return "pdf";
  // SVG / XML: text, possibly after a BOM and whitespace.
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length && i < 64 && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  const text = ascii(bytes, i, i + 256).toLowerCase();
  if (text.startsWith("<?xml") || text.startsWith("<svg") || text.startsWith("<!doctype svg") || text.includes("<svg")) return "svg";
  return "unknown";
}

/** Refusal for a type we won't take, or null when it's a raster we decode. Pure. */
export function typeRefusal(type: SniffedType): string | null {
  if (ACCEPTED.has(type)) return null;
  if (type === "svg") return "SVG files can't be used. Upload a photo (JPG, PNG or WebP).";
  if (type === "pdf") return "PDFs can't be used. Upload a photo (JPG, PNG or WebP).";
  if (type === "heic") return "That's an iPhone HEIC photo, which can't be read here. Pick it again from Photos (it converts to JPG), or save it as JPG first.";
  return "That file isn't a photo we can use. Upload a JPG, PNG or WebP.";
}

/** Size check before any decoding. Pure. */
export function checkUploadSize(byteLength: number): string | null {
  if (byteLength <= 0) return "That file is empty.";
  if (byteLength > THEME_ASSET.maxInputBytes) return "That photo is too big. Keep it under 15 MB.";
  return null;
}

/** Ids we mint: th_ + 24 hex. Pure. */
export function isThemeAssetId(id: string): boolean {
  return /^th_[a-f0-9]{24}$/.test(id);
}

export function newThemeAssetId(): string {
  return `th_${randomBytes(12).toString("hex")}`;
}

export function themeAssetKey(companyId: string, assetId: string): string {
  return `themes/${companyId}/${assetId}.webp`;
}

/** The photo ids a stored spec points at (band + login). Pure. */
export function specAssetIds(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as { band?: { imageId?: unknown }; login?: { imageId?: unknown } };
  const out: string[] = [];
  for (const v of [s.band?.imageId, s.login?.imageId]) if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  return out;
}

// sharp ships with Next (its optional dependency, installed by `npm ci`)
// and Next keeps it external to the server bundle. Loaded lazily so a
// missing native binary is a calm 503 on upload, never a crashed route.
type Sharp = (typeof import("sharp"))["default"];
let sharpMod: Sharp | null | undefined;
async function loadSharp(): Promise<Sharp | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    const m = (await import("sharp")) as unknown as { default?: Sharp };
    sharpMod = (m.default ?? (m as unknown as Sharp)) as Sharp;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

export type Reencoded = { data: Buffer; width: number; height: number };

/**
 * Decode `input` (already sniffed as a raster type) and re-encode it as WebP:
 * EXIF orientation applied, then every bit of metadata dropped (sharp keeps
 * none unless asked), long edge at most maxEdge, first frame only for an
 * animation. Steps the quality (and then the size) down until it fits in
 * maxOutputBytes.
 */
export async function reencodeThemeImage(input: Buffer): Promise<Reencoded> {
  const sharp = await loadSharp();
  if (!sharp) throw new ThemeAssetError("Photo uploads aren't available right now. Try again later.", 503, "UNAVAILABLE");

  let meta: { width?: number; height?: number; orientation?: number };
  try {
    meta = await sharp(input, { limitInputPixels: THEME_ASSET.maxInputPixels, failOn: "error" }).metadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/pixel limit/i.test(msg)) throw new ThemeAssetError("That photo has too many pixels. Use a smaller one.", 413, "TOO_BIG");
    throw new ThemeAssetError("That photo couldn't be read. Try another one.", 400, "BAD_IMAGE");
  }
  // Orientations 5–8 swap the sides.
  const swap = (meta.orientation ?? 1) >= 5;
  const w0 = (swap ? meta.height : meta.width) ?? 0;
  const h0 = (swap ? meta.width : meta.height) ?? 0;
  if (Math.min(w0, h0) < THEME_ASSET.minEdge) {
    throw new ThemeAssetError(`That photo is too small. Use one at least ${THEME_ASSET.minEdge} pixels on each side.`, 400, "TOO_SMALL");
  }

  const steps: { edge: number; quality: number }[] = [
    { edge: THEME_ASSET.maxEdge, quality: 82 },
    { edge: THEME_ASSET.maxEdge, quality: 70 },
    { edge: 2000, quality: 68 },
    { edge: 1600, quality: 65 },
  ];
  for (const step of steps) {
    let out: { data: Buffer; info: { width: number; height: number } };
    try {
      out = await sharp(input, { limitInputPixels: THEME_ASSET.maxInputPixels, failOn: "error", animated: false })
        .rotate()
        .resize({ width: step.edge, height: step.edge, fit: "inside", withoutEnlargement: true })
        .webp({ quality: step.quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ThemeAssetError("That photo couldn't be read. Try another one.", 400, "BAD_IMAGE");
    }
    if (out.data.byteLength <= THEME_ASSET.maxOutputBytes) {
      return { data: out.data, width: out.info.width, height: out.info.height };
    }
  }
  throw new ThemeAssetError("That photo is too detailed to shrink under 2 MB. Try another one.", 413, "TOO_BIG");
}

export type ThemeAssetInfo = { id: string; url: string; width: number; height: number; bytes: number; createdAt: string };

function info(companyId: string, row: { id: string; width: number; height: number; bytes: number; createdAt: Date }): ThemeAssetInfo {
  return { id: row.id, url: themeAssetUrl(companyId, row.id), width: row.width, height: row.height, bytes: row.bytes, createdAt: row.createdAt.toISOString() };
}

/**
 * Check, re-encode and store one photo for `companyId`. `mime` is what the
 * sender claimed; it is NOT trusted (the bytes decide), only used to give an
 * SVG/PDF a straight answer when the bytes are ambiguous. Throws
 * ThemeAssetError with a status and a plain message.
 */
export async function saveThemeAsset(companyId: string, data: Buffer, mime: string): Promise<ThemeAssetInfo> {
  const sizeProblem = checkUploadSize(data.byteLength);
  if (sizeProblem) throw new ThemeAssetError(sizeProblem, data.byteLength ? 413 : 400, data.byteLength ? "TOO_BIG" : "EMPTY");
  const claimed = (mime || "").split(";")[0].trim().toLowerCase();
  let type = sniffImageType(data);
  if (type === "unknown" && claimed === "image/svg+xml") type = "svg";
  if (type === "unknown" && claimed === "application/pdf") type = "pdf";
  const refusal = typeRefusal(type);
  if (refusal) throw new ThemeAssetError(refusal, 415, "BAD_TYPE");

  if (!isBlobStorageConfigured()) throw new ThemeAssetError("Photo uploads aren't available right now. Try again later.", 503, "UNAVAILABLE");

  const count = await prisma.themeAsset.count({ where: { companyId } });
  if (count >= THEME_ASSET.maxPerCompany) {
    throw new ThemeAssetError(`Your photo library is full (${THEME_ASSET.maxPerCompany}). Delete a photo you don't use first.`, 409, "LIBRARY_FULL");
  }
  const rl = await limit(`client-theme:upload:${companyId}`, THEME_LIMITS.uploadsPerDay, 24 * 60 * 60 * 1000);
  if (!rl.ok) throw new ThemeAssetError("That's the most photo uploads for one day. Try again tomorrow.", 429, "RATE_LIMITED");

  const img = await reencodeThemeImage(data);
  const id = newThemeAssetId();
  const key = themeAssetKey(companyId, id);
  await putObject(key, img.data, "image/webp");
  try {
    const row = await prisma.themeAsset.create({
      data: { id, companyId, key, width: img.width, height: img.height, bytes: img.data.byteLength },
      select: { id: true, width: true, height: true, bytes: true, createdAt: true },
    });
    return info(companyId, row);
  } catch (err) {
    await deleteObject(key).catch(() => {});
    throw err;
  }
}

/** Where a photo is in use right now: on the published look, the draft, or nowhere. */
export type AssetUse = "published" | "draft" | null;

async function usage(companyId: string): Promise<{ published: Set<string>; draft: Set<string> }> {
  const state = await getThemeState(companyId);
  return { published: new Set(specAssetIds(state.published?.spec)), draft: new Set(specAssetIds(state.draft?.spec)) };
}

/** This company's photos, newest first, each with where it is in use. */
export async function listThemeAssets(companyId: string): Promise<(ThemeAssetInfo & { inUse: AssetUse })[]> {
  const [rows, used] = await Promise.all([
    prisma.themeAsset.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, width: true, height: true, bytes: true, createdAt: true },
    }),
    usage(companyId),
  ]);
  return rows.map((r) => ({ ...info(companyId, r), inUse: used.published.has(r.id) ? "published" : used.draft.has(r.id) ? "draft" : null }));
}

/**
 * Delete one of this company's photos. Refused while the published look or
 * the draft uses it (pick another photo there first), so a live page never
 * loses its picture. Older versions that used it simply show without it if
 * brought back (resolveStoredSpec drops a missing photo).
 */
export async function deleteThemeAsset(companyId: string, assetId: string): Promise<void> {
  const row = isThemeAssetId(assetId)
    ? await prisma.themeAsset.findFirst({ where: { id: assetId, companyId }, select: { id: true, key: true } })
    : null;
  if (!row) throw new ThemeAssetError("That photo isn't there any more.", 404, "NOT_FOUND");
  const used = await usage(companyId);
  if (used.published.has(row.id)) throw new ThemeAssetError("This photo is on your published look. Pick another photo there first.", 409, "IN_USE");
  if (used.draft.has(row.id)) throw new ThemeAssetError("Your draft uses this photo. Pick another photo there first.", 409, "IN_USE");
  await prisma.themeAsset.delete({ where: { id: row.id } });
  await deleteObject(row.key).catch(() => {});
}
