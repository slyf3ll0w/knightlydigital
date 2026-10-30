import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { isManager, jobScope, viaContactScope, type Actor } from "@/lib/permissions";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";
import { randomUUID } from "node:crypto";
import { deleteObject, getObjectBytes, isBlobStorageConfigured, jobPhotoKey, putObject, signedGetUrl, wantsBytes } from "@/lib/blob-storage";
import { fireAutomations } from "@/lib/automations-server";
import { checkFeature } from "@/lib/plan-gate";
import { galleryPreviewFor } from "@/lib/gallery-preview";
import {
  PHOTO_LIMITS,
  PHOTO_MIME_TYPES,
  QUOTE_STAGE,
  defaultClientVisible,
  isPhotoStage,
  pairable,
  photoSrc,
  type PhotoStage,
  type PhotoView,
} from "@/lib/photos-shared";

/**
 * Photos — the server half (Gallery plan, phase A). One photo row serves a
 * quote (estimate photos), a job (before / during / after) or both once the
 * quote converts; every row carries companyId + contactId so scoping never
 * needs the job join. Routes:
 *
 *   POST   /api/app/photos                 multipart: file, thumb?, jobId | quoteId, type, caption, takenAt, lat, lng, accuracy, clientKey
 *   PATCH  /api/app/photos/[id]            { caption?, type?, clientVisible?, siteUse?, alt?, pairWith?: id | null }
 *   DELETE /api/app/photos/[id]
 *   GET    /api/job-photos/[id][?size=thumb]  the bytes (signed-in member of the company)
 *
 * The older /api/app/jobs/[id]/photos routes stay and call the same code.
 * Gate: a photo on a QUOTE is a Gallery feature (checkFeature "gallery");
 * job photos stay free as they always were (decision 1, 2026-10-30).
 * Before/after pairs (phase B) are Gallery too: `pairWith` on an upload or
 * a PATCH links one Before (or Estimate) shot with one After on the same
 * job — both rows carry the same pairId; `pairWith: null` unpairs.
 */

/** Who may see which photo rows. Techs: their jobs' photos; sales: their leads'. */
export function photoScope(actor: Actor): Prisma.JobPhotoWhereInput {
  if (isManager(actor.role) || actor.role === "USER") return { companyId: actor.companyId };
  if (actor.role === "TECH") return { companyId: actor.companyId, job: jobScope(actor) as Prisma.JobWhereInput };
  return { companyId: actor.companyId, contact: viaContactScope(actor).contact as Prisma.ContactWhereInput };
}

export const PHOTO_VIEW_SELECT = {
  id: true,
  type: true,
  caption: true,
  takenAt: true,
  createdAt: true,
  lat: true,
  lng: true,
  clientVisible: true,
  siteUse: true,
  alt: true,
  thumbKey: true,
  jobId: true,
  quoteId: true,
  pairId: true,
  user: { select: { name: true } },
} satisfies Prisma.JobPhotoSelect;

type PhotoRow = Prisma.JobPhotoGetPayload<{ select: typeof PHOTO_VIEW_SELECT }>;

export function toPhotoView(p: PhotoRow): PhotoView {
  return {
    id: p.id,
    stage: p.type as PhotoStage,
    caption: p.caption,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    by: p.user?.name ?? null,
    lat: p.lat,
    lng: p.lng,
    clientVisible: p.clientVisible,
    siteUse: p.siteUse,
    alt: p.alt,
    hasThumb: Boolean(p.thumbKey),
    jobId: p.jobId,
    quoteId: p.quoteId,
    pairId: p.pairId,
  };
}

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export type PhotoTarget = { jobId: string; quoteId?: undefined } | { quoteId: string; jobId?: undefined };

/** Everything a multipart upload may carry; parsed once, validated here. */
export type UploadInput = {
  target: PhotoTarget;
  file: File;
  thumb: File | null;
  stage: PhotoStage | null;
  caption: string | null;
  takenAt: Date | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  clientKey: string | null;
  /** A Before shot this upload is the After of ("match this angle"). */
  pairWith: string | null;
};

const num = (v: FormDataEntryValue | null): number | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Read the multipart body. `fixedTarget` is the job the old per-job route names in its path. */
export async function parseUpload(
  formData: FormData,
  fixedTarget?: PhotoTarget
): Promise<{ ok: true; input: UploadInput } | { ok: false; response: NextResponse }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, response: err("No file uploaded.", 400) };
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, response: err("Use a PNG, JPG, WebP, or GIF image.", 400) };
  }
  if (file.size > PHOTO_LIMITS.maxBytes) return { ok: false, response: err("Photo is too large — try again.", 400) };

  const thumbRaw = formData.get("thumb");
  const thumb =
    thumbRaw instanceof File && thumbRaw.type === "image/jpeg" && thumbRaw.size > 0 && thumbRaw.size <= PHOTO_LIMITS.maxThumbBytes
      ? thumbRaw
      : null;

  let target = fixedTarget;
  if (!target) {
    const jobId = formData.get("jobId");
    const quoteId = formData.get("quoteId");
    if (typeof jobId === "string" && jobId) target = { jobId };
    else if (typeof quoteId === "string" && quoteId) target = { quoteId };
    else return { ok: false, response: err("Say which job or quote the photo belongs to.", 400) };
  }

  const rawType = formData.get("type");
  const stage = isPhotoStage(rawType) ? rawType : null;
  const rawCaption = formData.get("caption");
  const caption =
    typeof rawCaption === "string" && rawCaption.trim() ? rawCaption.trim().slice(0, PHOTO_LIMITS.caption) : null;
  const rawTaken = formData.get("takenAt");
  const takenAtDate = typeof rawTaken === "string" && rawTaken ? new Date(rawTaken) : null;
  const takenAt = takenAtDate && !Number.isNaN(takenAtDate.getTime()) ? takenAtDate : null;
  const lat = num(formData.get("lat"));
  const lng = num(formData.get("lng"));
  const hasPoint = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const rawKey = formData.get("clientKey");
  const clientKey = typeof rawKey === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(rawKey) ? rawKey : null;
  const rawPair = formData.get("pairWith");
  const pairWith = typeof rawPair === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(rawPair) ? rawPair : null;

  return {
    ok: true,
    input: {
      target,
      file,
      thumb,
      stage,
      caption,
      takenAt,
      lat: hasPoint ? lat : null,
      lng: hasPoint ? lng : null,
      accuracy: hasPoint ? num(formData.get("accuracy")) : null,
      clientKey,
      pairWith,
    },
  };
}

/**
 * Store one photo on its job or quote. Returns the saved view (201), or the
 * existing one (200) when the clientKey was already uploaded — a phone that
 * lost signal mid-response retries without making a twin.
 */
export async function storePhoto(
  actor: Actor,
  input: UploadInput
): Promise<{ ok: true; photo: PhotoView; also: PhotoView[]; status: 200 | 201 } | { ok: false; response: NextResponse }> {
  const companyId = actor.companyId;

  if (input.clientKey) {
    const existing = await prisma.jobPhoto.findFirst({
      where: { clientKey: input.clientKey, companyId },
      select: PHOTO_VIEW_SELECT,
    });
    if (existing) return { ok: true, photo: toPhotoView(existing), also: [], status: 200 };
  }

  // Photos are the one real storage cost a preview account could rack up.
  if (await inPreview(companyId)) {
    const n = await prisma.jobPhoto.count({ where: { companyId } });
    if (n >= PREVIEW_CAP) return { ok: false, response: NextResponse.json(previewCapError("job photos"), { status: 403 }) };
  }

  let jobId: string | null = null;
  let quoteId: string | null = null;
  let contactId: string;
  let stage: PhotoStage;

  if (input.target.jobId) {
    const job = await prisma.job.findFirst({
      where: { id: input.target.jobId, companyId, ...jobScope(actor) },
      select: { id: true, contactId: true },
    });
    if (!job) return { ok: false, response: err("Job not found.", 404) };
    jobId = job.id;
    contactId = job.contactId;
    stage = input.stage && input.stage !== "ESTIMATE" ? input.stage : "GENERAL";
  } else {
    // Estimate photos are the Gallery plan's; techs don't work quotes at all.
    if (actor.role === "TECH") return { ok: false, response: err("Forbidden", 403) };
    // Preview: only test accounts until David opens the Gallery work.
    if (!(await galleryPreviewFor(companyId))) return { ok: false, response: err("Photos on quotes aren't available yet.", 403) };
    const gate = await checkFeature(companyId, "gallery");
    if (!gate.ok) return { ok: false, response: gate.response };
    const quote = await prisma.quote.findFirst({
      where: { id: input.target.quoteId, companyId, ...viaContactScope(actor) },
      select: { id: true, contactId: true, jobId: true },
    });
    if (!quote) return { ok: false, response: err("Quote not found.", 404) };
    quoteId = quote.id;
    // A photo added to an already-converted quote belongs to its job too.
    jobId = quote.jobId;
    contactId = quote.contactId;
    stage = QUOTE_STAGE;
  }

  const onTarget = await prisma.jobPhoto.count({ where: jobId ? { jobId } : { quoteId: quoteId! } });
  if (onTarget >= PHOTO_LIMITS.perTarget) {
    return {
      ok: false,
      response: err(`This ${jobId ? "job" : "quote"} already has ${PHOTO_LIMITS.perTarget} photos — delete one to add another.`, 400),
    };
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());

  // Create first so the row's id can name the object, then move the bytes out
  // to R2 and drop them from Postgres. If R2 isn't configured the bytes just
  // stay in the row, which is how this worked before object storage existed.
  const created = await prisma.jobPhoto.create({
    data: {
      jobId,
      quoteId,
      contactId,
      companyId,
      userId: actor.id,
      type: stage,
      caption: input.caption,
      takenAt: input.takenAt ?? new Date(),
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      clientKey: input.clientKey,
      clientVisible: defaultClientVisible(stage),
      data: bytes,
      mimeType: input.file.type,
      sizeBytes: bytes.byteLength,
      url: "",
    },
    select: { id: true },
  });

  let storageKey: string | null = null;
  let thumbKey: string | null = null;
  if (isBlobStorageConfigured()) {
    // Objects are filed under the job when there is one, else the quote.
    const folder = jobId ?? `quotes/${quoteId}`;
    const key = jobPhotoKey(companyId, folder, created.id, input.file.type);
    try {
      await putObject(key, bytes, input.file.type);
      storageKey = key;
      if (input.thumb) {
        const tkey = jobPhotoKey(companyId, folder, `${created.id}-thumb`, "image/jpeg");
        await putObject(tkey, Buffer.from(await input.thumb.arrayBuffer()), "image/jpeg");
        thumbKey = tkey;
      }
    } catch (e) {
      // Keep the upload rather than lose the tech's photo — it stays in
      // Postgres and the backfill script can move it later.
      reportError("[photos] R2 upload failed, keeping bytes in Postgres", e);
    }
  }

  let photo = toPhotoView(
    await prisma.jobPhoto.update({
      where: { id: created.id },
      data: {
        url: photoSrc(created.id),
        ...(storageKey ? { storageKey, data: null } : {}),
        ...(thumbKey ? { thumbKey } : {}),
      },
      select: PHOTO_VIEW_SELECT,
    })
  );
  if (jobId) fireAutomations(companyId, "job.photo_added", jobId);

  // "Match this angle": the shot was taken as the After of a given Before.
  // A pairing that can't be made (the Before was deleted or paired meanwhile,
  // the plan lapsed) never loses the photo — it just stands alone.
  let also: PhotoView[] = [];
  if (input.pairWith && jobId) {
    const paired = await setPair(actor, photo.id, input.pairWith);
    if (paired.ok) {
      photo = paired.photo;
      also = paired.also;
    }
  }

  return { ok: true, photo, also, status: 201 };
}

/**
 * Pair this photo with another on the same job (one Before or Estimate, one
 * After), or `null` to take it out of its pair. Pairs are a Gallery-plan
 * feature. Returns the photo plus every other row whose pairId changed, so
 * the grid can repaint without a reload.
 */
export async function setPair(
  actor: Actor,
  photoId: string,
  withId: string | null
): Promise<{ ok: true; photo: PhotoView; also: PhotoView[] } | { ok: false; response: NextResponse }> {
  const companyId = actor.companyId;
  if (!(await galleryPreviewFor(companyId))) return { ok: false, response: err("Before-and-after pairs aren't available yet.", 403) };
  const gate = await checkFeature(companyId, "gallery");
  if (!gate.ok) return { ok: false, response: gate.response };

  const row = await prisma.jobPhoto.findFirst({ where: { id: photoId, ...photoScope(actor) }, select: PHOTO_VIEW_SELECT });
  if (!row) return { ok: false, response: err("Photo not found.", 404) };
  const photo = toPhotoView(row);

  if (withId === null) {
    if (!photo.pairId) return { ok: true, photo, also: [] };
    const others = await prisma.jobPhoto.findMany({ where: { pairId: photo.pairId, id: { not: photo.id } }, select: { id: true } });
    await prisma.jobPhoto.updateMany({ where: { pairId: photo.pairId }, data: { pairId: null } });
    const fresh = await prisma.jobPhoto.findMany({ where: { id: { in: [photo.id, ...others.map((o) => o.id)] } }, select: PHOTO_VIEW_SELECT });
    const views = fresh.map(toPhotoView);
    return { ok: true, photo: views.find((v) => v.id === photo.id) ?? { ...photo, pairId: null }, also: views.filter((v) => v.id !== photo.id) };
  }

  const otherRow = await prisma.jobPhoto.findFirst({ where: { id: withId, ...photoScope(actor) }, select: PHOTO_VIEW_SELECT });
  if (!otherRow) return { ok: false, response: err("That photo isn't on this job anymore.", 404) };
  const other = toPhotoView(otherRow);
  const check = pairable(photo, other);
  if (!check.ok) return { ok: false, response: err(check.why, 400) };

  const pairId = photo.pairId ?? other.pairId ?? randomUUID();
  await prisma.jobPhoto.updateMany({ where: { id: { in: [photo.id, other.id] } }, data: { pairId } });
  const fresh = await prisma.jobPhoto.findMany({ where: { id: { in: [photo.id, other.id] } }, select: PHOTO_VIEW_SELECT });
  const views = fresh.map(toPhotoView);
  return { ok: true, photo: views.find((v) => v.id === photo.id)!, also: views.filter((v) => v.id !== photo.id) };
}

/**
 * Answer a request for a photo's bytes, once the caller has decided the
 * requester may see it. Two storage paths, one URL: a photo in R2 answers
 * with a redirect to a short-lived presigned URL (bytes go browser↔R2); a
 * photo still in Postgres streams from the row. A script's fetch() (CORS
 * mode) can't follow the redirect, so it gets the bytes through us
 * (wantsBytes). `thumb` asks for the 400 px copy when there is one.
 */
export async function photoResponse(
  req: NextRequest,
  photo: { id: string; data: Uint8Array | null; mimeType: string | null; storageKey: string | null; thumbKey: string | null },
  wantThumb: boolean
): Promise<NextResponse> {
  const key = wantThumb && photo.thumbKey ? photo.thumbKey : photo.storageKey;
  const mime = wantThumb && photo.thumbKey ? "image/jpeg" : photo.mimeType;

  if (key && isBlobStorageConfigured()) {
    try {
      if (wantsBytes(req.headers)) {
        const bytes = await getObjectBytes(key);
        if (bytes && mime) {
          return new NextResponse(bytes, {
            headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
          });
        }
      }
      const url = await signedGetUrl(key);
      // Cache shorter than the signature's own lifetime, or a browser could
      // reuse a cached redirect to a URL that has already expired.
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
    } catch (e) {
      reportError("[job-photos] signing failed", { photoId: photo.id, error: e });
      // Fall through: a photo mid-migration may still have its bytes here.
    }
  }

  if (!photo.data || !photo.mimeType) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * The stored bytes of one photo (R2, or the row while a photo is still in
 * Postgres) — for the report PDF, which embeds images rather than linking
 * them. Null when neither place has them.
 */
export async function readPhotoBytes(photo: { storageKey: string | null; data: Uint8Array | null; mimeType: string | null }): Promise<Buffer | null> {
  if (photo.storageKey && isBlobStorageConfigured()) {
    try {
      const bytes = await getObjectBytes(photo.storageKey);
      if (bytes) return Buffer.from(bytes);
    } catch (e) {
      reportError("[photos] read failed", { key: photo.storageKey, error: e });
    }
  }
  return photo.data ? Buffer.from(photo.data) : null;
}

export type PhotoPatch = {
  caption?: string | null;
  type?: PhotoStage;
  clientVisible?: boolean;
  siteUse?: boolean;
  alt?: string | null;
  /** Another photo's id to pair with; null to unpair. */
  pairWith?: string | null;
};

/** Read a PATCH body into the fields a caller may change. Unknown keys are ignored. */
export function parsePatch(body: Record<string, unknown>): PhotoPatch {
  const patch: PhotoPatch = {};
  if (body.pairWith === null) patch.pairWith = null;
  else if (typeof body.pairWith === "string" && body.pairWith) patch.pairWith = body.pairWith;
  if (typeof body.caption === "string") patch.caption = body.caption.trim().slice(0, PHOTO_LIMITS.caption) || null;
  if (isPhotoStage(body.type)) patch.type = body.type;
  if (typeof body.clientVisible === "boolean") patch.clientVisible = body.clientVisible;
  if (typeof body.siteUse === "boolean") patch.siteUse = body.siteUse;
  if (typeof body.alt === "string") patch.alt = body.alt.trim().slice(0, 160) || null;
  return patch;
}

/**
 * Change a photo's words, stage or visibility. Anyone who can see the photo
 * may caption, re-stage or show it to the client; only owners and admins put
 * it on the public website. `jobId` pins the photo to a job when the caller
 * is the old per-job route.
 */
export async function patchPhoto(
  actor: Actor,
  photoId: string,
  patch: PhotoPatch,
  jobId?: string
): Promise<{ ok: true; photo: PhotoView; also: PhotoView[] } | { ok: false; response: NextResponse }> {
  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, ...(jobId ? { jobId } : {}), ...photoScope(actor) },
    select: { id: true, siteUse: true, jobId: true },
  });
  if (!photo) return { ok: false, response: err("Photo not found.", 404) };

  // Pairing is its own write (two rows); the other fields follow below.
  let also: PhotoView[] = [];
  if (patch.pairWith !== undefined) {
    const paired = await setPair(actor, photo.id, patch.pairWith);
    if (!paired.ok) return paired;
    also = paired.also;
    const { pairWith: _p, ...rest } = patch;
    if (!Object.keys(rest).length) return { ok: true, photo: paired.photo, also };
  }

  const data: Prisma.JobPhotoUpdateInput = {};
  if (patch.caption !== undefined) data.caption = patch.caption;
  if (patch.alt !== undefined) data.alt = patch.alt;
  if (patch.clientVisible !== undefined) data.clientVisible = patch.clientVisible;
  if (patch.type !== undefined) {
    // An estimate photo is one taken before the job; on a job the tech's
    // choices are the job stages.
    if (patch.type === "ESTIMATE" && photo.jobId) return { ok: false, response: err("Pick Before, During, After or Photo.", 400) };
    data.type = patch.type;
  }
  if (patch.siteUse !== undefined) {
    if (!isManager(actor.role)) return { ok: false, response: err("Only owners and admins can put photos on the website.", 403) };
    data.siteUse = patch.siteUse;
  }
  if (!Object.keys(data).length) return { ok: false, response: err("Nothing to change.", 400) };

  const updated = await prisma.jobPhoto.update({ where: { id: photo.id }, data, select: PHOTO_VIEW_SELECT });
  if (patch.siteUse !== undefined || (photo.siteUse && (patch.alt !== undefined || patch.caption !== undefined))) {
    const { scheduleSiteRebuild } = await import("@/lib/website");
    scheduleSiteRebuild(actor.companyId, "job photo flagged");
  }
  return { ok: true, photo: toPhotoView(updated), also };
}

export async function deletePhoto(
  actor: Actor,
  photoId: string,
  jobId?: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, ...(jobId ? { jobId } : {}), ...photoScope(actor) },
    select: { id: true, storageKey: true, thumbKey: true, siteUse: true },
  });
  if (!photo) return { ok: false, response: err("Photo not found.", 404) };

  await prisma.jobPhoto.delete({ where: { id: photo.id } });

  // Drop the objects too, or deleted photos bill forever as orphans nothing
  // points at. The row is already gone, so a failure here is logged rather
  // than surfaced — the user's delete did happen.
  if (isBlobStorageConfigured()) {
    for (const key of [photo.storageKey, photo.thumbKey]) {
      if (!key) continue;
      await deleteObject(key).catch((e) => reportError("[photos] orphaned object in R2", { key, error: e }));
    }
  }
  if (photo.siteUse) {
    const { scheduleSiteRebuild } = await import("@/lib/website");
    scheduleSiteRebuild(actor.companyId, "job photo removed");
  }
  return { ok: true };
}

/** The photos on one job or quote, oldest first, shaped for the grid. */
export async function listPhotosFor(target: PhotoTarget): Promise<PhotoView[]> {
  const rows = await prisma.jobPhoto.findMany({
    where: target.jobId ? { jobId: target.jobId } : { quoteId: target.quoteId },
    orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }],
    select: PHOTO_VIEW_SELECT,
  });
  return rows.map(toPhotoView);
}
