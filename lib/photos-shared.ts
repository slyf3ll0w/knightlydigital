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

// ─── Before / after pairs (phase B) ───────────────────────────────────────────

/** The "before" side of a pair: a Before shot, or an Estimate photo from the site visit. */
export function isBeforeStage(stage: PhotoStage): boolean {
  return stage === "BEFORE" || stage === "ESTIMATE";
}

export type PhotoPair = { id: string; before: PhotoView; after: PhotoView };

/** Oldest first by when it was taken (a pair's two halves line up in shooting order). */
export function byTaken(a: Pick<PhotoView, "takenAt" | "createdAt">, b: Pick<PhotoView, "takenAt" | "createdAt">): number {
  return Date.parse(a.takenAt ?? a.createdAt) - Date.parse(b.takenAt ?? b.createdAt);
}

/** The complete pairs among these photos (a pairId with one before and one after), oldest first. */
export function pairsOf(photos: PhotoView[]): PhotoPair[] {
  const byPair = new Map<string, PhotoView[]>();
  for (const p of photos) {
    if (!p.pairId) continue;
    byPair.set(p.pairId, [...(byPair.get(p.pairId) ?? []), p]);
  }
  const out: PhotoPair[] = [];
  for (const [id, members] of byPair) {
    const before = members.find((m) => isBeforeStage(m.stage));
    const after = members.find((m) => m.stage === "AFTER");
    if (before && after) out.push({ id, before, after });
  }
  return out.sort((x, y) => byTaken(x.after, y.after));
}

/**
 * May these two be a pair? Same job, one before-ish and one after, and
 * neither already paired with somebody else. Order doesn't matter.
 */
export function pairable(a: PhotoView, b: PhotoView): { ok: true; before: PhotoView; after: PhotoView } | { ok: false; why: string } {
  if (a.id === b.id) return { ok: false, why: "Pick two different photos." };
  if (!a.jobId || a.jobId !== b.jobId) return { ok: false, why: "Both photos have to be on the same job." };
  const before = isBeforeStage(a.stage) ? a : isBeforeStage(b.stage) ? b : null;
  const after = a.stage === "AFTER" ? a : b.stage === "AFTER" ? b : null;
  if (!before || !after || before.id === after.id) return { ok: false, why: "A pair is one Before (or Estimate) photo and one After photo." };
  for (const p of [a, b]) {
    if (p.pairId && p.pairId !== (p === a ? b : a).pairId) return { ok: false, why: "That photo is already in a pair — unpair it first." };
  }
  return { ok: true, before, after };
}

/** Befores and afters nobody has paired yet, in shooting order. */
export function unpaired(photos: PhotoView[]): { befores: PhotoView[]; afters: PhotoView[] } {
  const paired = new Set(pairsOf(photos).flatMap((p) => [p.before.id, p.after.id]));
  const loose = photos.filter((p) => !paired.has(p.id)).sort(byTaken);
  return { befores: loose.filter((p) => isBeforeStage(p.stage)), afters: loose.filter((p) => p.stage === "AFTER") };
}

/**
 * Auto-suggest: first loose Before with the first loose After, and so on —
 * techs shoot befores in a walk-through order and afters in the same order.
 * Returns [beforeId, afterId] tuples; empty when there is nothing to match.
 */
export function suggestPairs(photos: PhotoView[]): [string, string][] {
  const { befores, afters } = unpaired(photos);
  const n = Math.min(befores.length, afters.length);
  const out: [string, string][] = [];
  for (let i = 0; i < n; i++) out.push([befores[i].id, afters[i].id]);
  return out;
}

/**
 * "Match this angle": the before shot the next After should line up with —
 * the oldest Before nobody has paired yet. Null when every before has its
 * after (or there are none), so the camera just opens.
 */
export function nextBeforeToMatch(photos: PhotoView[]): PhotoView | null {
  return unpaired(photos).befores[0] ?? null;
}

// ─── Work completed report (phase B) ──────────────────────────────────────────

/**
 * What the client gets to see. Pairs show when their AFTER is visible (the
 * Before in a pair is there to make the After mean something — pairing IS
 * the decision to show the comparison); every other visible photo stands
 * alone. Hidden photos never leave the building.
 */
export function reportPhotos(photos: PhotoView[]): { pairs: PhotoPair[]; singles: PhotoView[] } {
  const pairs = pairsOf(photos).filter((p) => p.after.clientVisible);
  const inPair = new Set(pairs.flatMap((p) => [p.before.id, p.after.id]));
  const singles = photos.filter((p) => p.clientVisible && !inPair.has(p.id)).sort(byTaken);
  return { pairs, singles };
}

/** May the client see this one photo (directly, or as the Before of a shown pair)? */
export function clientMaySee(photo: PhotoView, siblings: PhotoView[]): boolean {
  if (photo.clientVisible) return true;
  if (!photo.pairId) return false;
  return siblings.some((s) => s.pairId === photo.pairId && s.stage === "AFTER" && s.clientVisible);
}

export const REPORT_NOTE_MAX = 1000;

/** The client's report lives in their hub; the PDF sits under it. */
export function reportPath(hubToken: string, jobId: string): string {
  return `/hub/${hubToken}/work/${jobId}`;
}

/** A client-visible photo served through the hub (the token is the credential). */
export function hubPhotoSrc(hubToken: string, photoId: string, size: "full" | "thumb" = "full"): string {
  const base = `/hub/${hubToken}/photos/${photoId}`;
  return size === "thumb" ? `${base}?size=thumb` : base;
}

/** One line for the report email / text: "4 photos and 2 before-and-after comparisons". */
export function reportSummaryLine(counts: { pairs: number; singles: number; checklist: number }): string {
  const bits: string[] = [];
  if (counts.pairs > 0) bits.push(`${counts.pairs} before-and-after ${counts.pairs === 1 ? "comparison" : "comparisons"}`);
  if (counts.singles > 0) bits.push(`${counts.singles} ${counts.singles === 1 ? "photo" : "photos"}`);
  if (counts.checklist > 0) bits.push(`the ${counts.checklist}-item checklist`);
  if (bits.length === 0) return "";
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
}
