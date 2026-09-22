import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isBlobStorageConfigured, putObject, signedGetUrl } from "./blob-storage";
import { ESTIMATOR_LIMITS, specFromJson, type EstimatorSpec } from "./estimator";
import { imageIdsIn, listingFacts, remapImages } from "./estimator-portable";
import { ESTIMATOR_SELECT, estimatorSummary, snapshotEstimator } from "./estimator-server";
import { INDUSTRIES } from "./pricebooks";

/**
 * The Library's Prisma half (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 10). Listings are PORTABLE snapshots (lib/estimator-portable.ts);
 * adding one copies it into the adopter's company as an ordinary Estimator
 * row, pictures included, so an unlisting or a Workbench takedown later
 * never reaches into anyone else's tools.
 */

export const LISTING_STATUS = { live: "LIVE", hidden: "HIDDEN", removed: "REMOVED" } as const;
export const LISTING_PAGE = 30;
export const LISTING_DESCRIPTION = { min: 20, max: 1200 } as const;

export function isIndustry(v: unknown): v is (typeof INDUSTRIES)[number] {
  return typeof v === "string" && (INDUSTRIES as readonly string[]).includes(v);
}

export const LISTING_SELECT = {
  id: true,
  estimatorId: true,
  companyId: true,
  name: true,
  description: true,
  industry: true,
  anonymous: true,
  byName: true,
  spec: true,
  likes: true,
  adds: true,
  status: true,
  removedReason: true,
  removedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ListingRow = Prisma.EstimatorListingGetPayload<{ select: typeof LISTING_SELECT }>;

/** What the browse page shows for one listing (no spec — that's the detail call). */
export type ListingCard = {
  id: string;
  name: string;
  description: string;
  industry: string;
  /** null = shared anonymously */
  byName: string | null;
  likes: number;
  adds: number;
  facts: string[];
  createdAt: string;
  liked: boolean;
  added: boolean;
  mine: boolean;
};

export function listingCard(row: ListingRow, ctx: { companyId: string; liked: Set<string>; added: Set<string>; atlasName?: string }): ListingCard | null {
  const spec = specFromJson(row.spec);
  if (!spec) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    byName: row.anonymous ? null : row.byName,
    likes: row.likes,
    adds: row.adds,
    facts: listingFacts(spec, ctx.atlasName),
    createdAt: row.createdAt.toISOString(),
    liked: ctx.liked.has(row.id),
    added: ctx.added.has(row.id),
    mine: row.companyId === ctx.companyId,
  };
}

/** Which of these listings my company liked / already copied. */
export async function listingMarks(companyId: string, listingIds: string[]): Promise<{ liked: Set<string>; added: Set<string> }> {
  if (listingIds.length === 0) return { liked: new Set(), added: new Set() };
  const [likes, copies] = await Promise.all([
    prisma.estimatorListingLike.findMany({ where: { companyId, listingId: { in: listingIds } }, select: { listingId: true } }),
    prisma.estimator.findMany({ where: { companyId, sourceListingId: { in: listingIds } }, select: { sourceListingId: true } }),
  ]);
  return { liked: new Set(likes.map((l) => l.listingId)), added: new Set(copies.map((c) => c.sourceListingId as string)) };
}

/** A LIVE listing anyone can see, or one of my own in any state. */
export async function loadVisibleListing(id: string, companyId: string): Promise<ListingRow | null> {
  const row = await prisma.estimatorListing.findUnique({ where: { id }, select: LISTING_SELECT });
  if (!row) return null;
  if (row.status !== LISTING_STATUS.live && row.companyId !== companyId) return null;
  return row;
}

/** Like / unlike for a company; the counter moves in the same transaction. */
export async function toggleLike(listingId: string, companyId: string): Promise<{ liked: boolean; likes: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimatorListingLike.findUnique({ where: { listingId_companyId: { listingId, companyId } }, select: { id: true } });
    if (existing) {
      await tx.estimatorListingLike.delete({ where: { id: existing.id } });
      const row = await tx.estimatorListing.update({ where: { id: listingId }, data: { likes: { decrement: 1 } }, select: { likes: true } });
      return { liked: false, likes: Math.max(0, row.likes) };
    }
    await tx.estimatorListingLike.create({ data: { listingId, companyId } });
    const row = await tx.estimatorListing.update({ where: { id: listingId }, data: { likes: { increment: 1 } }, select: { likes: true } });
    return { liked: true, likes: row.likes };
  });
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * Copy the pictures a spec references into the adopting company's tool. Best
 * effort per picture: a copy that fails keeps the original URL (the source
 * row is public anyway) — a picture is never a reason to fail the add.
 */
async function copyImages(spec: EstimatorSpec, companyId: string, estimatorId: string): Promise<EstimatorSpec> {
  const ids = imageIdsIn(spec);
  if (ids.length === 0) return spec;
  const map = new Map<string, string>();
  const sources = await prisma.estimatorImage.findMany({ where: { id: { in: ids } }, select: { id: true, mimeType: true, data: true, storageKey: true, sizeBytes: true } });
  for (const src of sources) {
    try {
      let bytes: Buffer | null = src.data ? Buffer.from(src.data) : null;
      if (!bytes && src.storageKey && isBlobStorageConfigured()) {
        const res = await fetch(await signedGetUrl(src.storageKey));
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
      }
      if (!bytes) continue;
      const row = await prisma.estimatorImage.create({
        data: { companyId, estimatorId, mimeType: src.mimeType, sizeBytes: bytes.byteLength, data: bytes },
        select: { id: true },
      });
      if (isBlobStorageConfigured()) {
        try {
          const key = `companies/${companyId}/estimators/${estimatorId}/${row.id}.${EXT[src.mimeType] ?? "bin"}`;
          await putObject(key, bytes, src.mimeType);
          await prisma.estimatorImage.update({ where: { id: row.id }, data: { storageKey: key, data: null } });
        } catch (err) {
          console.error("[library] R2 copy failed; bytes stay in Postgres", err);
        }
      }
      map.set(src.id, row.id);
    } catch (err) {
      console.error("[library] picture copy failed; keeping the original URL", { id: src.id, error: err });
    }
  }
  return map.size > 0 ? remapImages(spec, map) : spec;
}

/** "Fence Estimator" → "Fence Estimator 2" when the company already has one. */
export async function uniqueToolName(companyId: string, wanted: string): Promise<string> {
  let name = wanted.trim().slice(0, 80) || "Estimate tool";
  for (let n = 2; n < 20; n++) {
    const dup = await prisma.estimator.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (!dup) break;
    name = `${wanted.replace(/ \d+$/, "").slice(0, 76)} ${n}`;
  }
  return name;
}

export type AddResult = { ok: true; tool: Record<string, unknown> } | { ok: false; status: number; error: string };

/** Copy a LIVE listing into a company as its own tool. */
export async function addListingToCompany(listing: ListingRow, actor: { id: string; name: string; companyId: string }): Promise<AddResult> {
  if (listing.status !== LISTING_STATUS.live) return { ok: false, status: 404, error: "That tool isn't in the Library any more." };
  if (listing.companyId === actor.companyId) return { ok: false, status: 400, error: "That's already your tool." };
  const spec = specFromJson(listing.spec);
  if (!spec) return { ok: false, status: 409, error: "This listing's rules no longer compile — try another." };
  const count = await prisma.estimator.count({ where: { companyId: actor.companyId } });
  if (count >= ESTIMATOR_LIMITS.perCompany) {
    return { ok: false, status: 400, error: `You have ${ESTIMATOR_LIMITS.perCompany} estimate tools already — delete one to add another.` };
  }
  const name = await uniqueToolName(actor.companyId, listing.name);
  const firstSentence = listing.description.split(/(?<=[.!?])\s/)[0]?.trim().slice(0, 160) ?? "";
  const description = firstSentence ? `From the Library — ${firstSentence}`.slice(0, 200) : "From the Library";
  const created = await prisma.estimator.create({
    data: { companyId: actor.companyId, name, description, spec: spec as unknown as Prisma.InputJsonValue, sourceListingId: listing.id },
    select: ESTIMATOR_SELECT,
  });
  const withImages = await copyImages(spec, actor.companyId, created.id);
  const row =
    withImages === spec
      ? created
      : await prisma.estimator.update({ where: { id: created.id }, data: { spec: withImages as unknown as Prisma.InputJsonValue }, select: ESTIMATOR_SELECT });
  await snapshotEstimator(row, "Added from the Library", { id: actor.id, name: actor.name });
  void prisma.estimatorListing.update({ where: { id: listing.id }, data: { adds: { increment: 1 } } }).catch(() => {});
  return { ok: true, tool: { ...estimatorSummary(row, withImages), spec: withImages } };
}

/** The owner's view of their own listing, for the tool page's Library section. */
export function shareState(row: ListingRow | null) {
  if (!row) return { listed: false as const };
  return {
    listed: row.status !== LISTING_STATUS.hidden,
    status: row.status,
    industry: row.industry,
    description: row.description,
    anonymous: row.anonymous,
    likes: row.likes,
    adds: row.adds,
    removedReason: row.removedReason,
    updatedAt: row.updatedAt.toISOString(),
  };
}
