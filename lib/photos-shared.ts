/**
 * Photos — the pure, client-safe half (no Prisma). Stage names, defaults and
 * the serving URLs that the grid, the viewer, the API routes and the tests
 * all share. Server I/O lives in lib/photos.ts.
 *
 * Gallery plan (docs/plans/job-photos-companycam-2026-09-25.md, "2026-10-20
 * reframe"): one photo across the lifecycle — ESTIMATE on the site visit
 * (quote), BEFORE / DURING / AFTER on the job, GENERAL for anything else.
 *
 *   npx tsx scripts/test-photos.ts
 */

export const PHOTO_STAGES = ["ESTIMATE", "BEFORE", "DURING", "AFTER", "GENERAL"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export function isPhotoStage(v: unknown): v is PhotoStage {
  return typeof v === "string" && (PHOTO_STAGES as readonly string[]).includes(v);
}

/** The word on the pill. GENERAL gets none — it is just "a photo". */
export const STAGE_LABEL: Record<PhotoStage, string> = {
  ESTIMATE: "Estimate",
  BEFORE: "Before",
  DURING: "During",
  AFTER: "After",
  GENERAL: "",
};

/** What the stage picker offers on each kind of page. */
export const JOB_STAGE_OPTIONS: readonly { value: PhotoStage; label: string }[] = [
  { value: "GENERAL", label: "Photo" },
  { value: "BEFORE", label: "Before" },
  { value: "DURING", label: "During" },
  { value: "AFTER", label: "After" },
];

/** A photo on a quote is always an estimate photo; there is nothing to pick. */
export const QUOTE_STAGE: PhotoStage = "ESTIMATE";

/**
 * May the client see it without anyone flipping a switch? AFTER shots show
 * finished work, so yes; everything else (a messy Before, an Estimate of the
 * problem, a mid-job During) waits for a tech (David 2026-10-30, decision 4).
 */
export function defaultClientVisible(stage: PhotoStage): boolean {
  return stage === "AFTER";
}

/**
 * Which stages a filter tab shows. "Before" on a job includes the estimate
 * photos that rode over from the quote — they ARE the before set.
 */
export type PhotoFilter = "ALL" | "BEFORE" | "AFTER";
export function filterMatches(filter: PhotoFilter, stage: PhotoStage): boolean {
  if (filter === "ALL") return true;
  if (filter === "BEFORE") return stage === "BEFORE" || stage === "ESTIMATE";
  return stage === "AFTER";
}

/** Limits every uploader and route agree on. */
export const PHOTO_LIMITS = {
  /** Client-side optimization shrinks uploads before they get here; this is a backstop. */
  maxBytes: 4 * 1024 * 1024,
  /** Thumbnails are 400 px JPEGs; anything bigger is not a thumbnail. */
  maxThumbBytes: 256 * 1024,
  /** Per job or per quote. Far past documenting real work and still bounded. */
  perTarget: 100,
  caption: 300,
  /** Files per pick in the browser (keeps one tap from uploading a camera roll). */
  perPick: 10,
} as const;

export const PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** The authed serving URL. `thumb` asks for the 400 px copy (falls back to the full one). */
export function photoSrc(id: string, size: "full" | "thumb" = "full"): string {
  return size === "thumb" ? `/api/job-photos/${id}?size=thumb` : `/api/job-photos/${id}`;
}

/** Open the capture spot in the phone's maps app. */
export function photoMapUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Geolocation is only worth attaching to a shot taken just now. A library
 * pick from last week would otherwise be stamped with wherever the phone is
 * today. `takenAt` comes from the file (camera-roll files keep their capture
 * time as the modified time); a shot from the in-app camera is "now".
 */
export const FRESH_SHOT_MS = 10 * 60 * 1000;
export function shouldStampLocation(takenAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - takenAt.getTime() <= FRESH_SHOT_MS;
}

/** What the grid and viewer render — the serialized row. */
export type PhotoView = {
  id: string;
  stage: PhotoStage;
  caption: string | null;
  takenAt: string | null;
  createdAt: string;
  by: string | null;
  lat: number | null;
  lng: number | null;
  clientVisible: boolean;
  siteUse: boolean;
  alt: string | null;
  hasThumb: boolean;
  jobId: string | null;
  quoteId: string | null;
  pairId: string | null;
};
