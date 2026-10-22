/**
 * The route-stop half of a time block's request body (POST / PATCH
 * /api/app/time-blocks): what kind of stop it is, the saved place it was
 * picked from, whether the optimizer may place it and inside which window,
 * and the job it must come before. Shared by the block routes and the
 * route page's "Add a stop" endpoint so the rules live once.
 */

import { prisma } from "@/lib/db";
import { jobScope, type Actor } from "@/lib/permissions";

export type TimeBlockKind = "BLOCK" | "ERRAND" | "BREAK";

export type RouteStopFields = {
  kind?: TimeBlockKind;
  placeId?: string | null;
  flexible?: boolean;
  floatAfterMin?: number | null;
  floatBeforeMin?: number | null;
  beforeJobId?: string | null;
  /** A re-timed flexible stop is "unplaced" again until the next Optimize. */
  placedAt?: Date | null;
};

const KINDS: TimeBlockKind[] = ["BLOCK", "ERRAND", "BREAK"];

/** Minutes from midnight: "HH:mm" or a number; absent / null / "" = none; anything else is an error. */
export function minuteField(v: unknown): number | null | "error" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 24 * 60 ? v : "error";
  if (typeof v === "string") {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 24 * 60) return n;
  }
  return "error";
}

/**
 * Parse (and check) the route-stop fields present in `body`. Only keys
 * present come back, so a PATCH can send a partial. `existing` is the row
 * being edited (its kind decides whether a float window makes sense).
 */
export async function routeStopFields(
  body: Record<string, unknown>,
  actor: Actor,
  existing?: { kind: string; flexible: boolean; floatAfterMin: number | null; floatBeforeMin: number | null } | null
): Promise<RouteStopFields | { error: string }> {
  const out: RouteStopFields = {};
  if (body.kind !== undefined) {
    const kind = typeof body.kind === "string" ? (body.kind.toUpperCase() as TimeBlockKind) : "BLOCK";
    if (!KINDS.includes(kind)) return { error: "That kind of stop doesn't exist." };
    out.kind = kind;
  }
  const kind = out.kind ?? (existing?.kind as TimeBlockKind | undefined) ?? "BLOCK";

  if (body.placeId !== undefined) {
    if (body.placeId === null || body.placeId === "") out.placeId = null;
    else if (typeof body.placeId === "string" && body.placeId.length <= 64) {
      const place = await prisma.place.findFirst({ where: { id: body.placeId, companyId: actor.companyId }, select: { id: true } });
      if (!place) return { error: "That place doesn't exist." };
      out.placeId = place.id;
    } else return { error: "That place isn't valid." };
  }

  if (body.flexible !== undefined) {
    out.flexible = Boolean(body.flexible) && kind !== "BLOCK";
  }
  if (body.floatAfterMin !== undefined) {
    const v = minuteField(body.floatAfterMin);
    if (v === "error") return { error: "The earliest time isn't valid." };
    out.floatAfterMin = v;
  }
  if (body.floatBeforeMin !== undefined) {
    const v = minuteField(body.floatBeforeMin);
    if (v === "error") return { error: "The latest time isn't valid." };
    out.floatBeforeMin = v;
  }
  const after = out.floatAfterMin !== undefined ? out.floatAfterMin : existing?.floatAfterMin ?? null;
  const before = out.floatBeforeMin !== undefined ? out.floatBeforeMin : existing?.floatBeforeMin ?? null;
  if (after != null && before != null && before <= after) return { error: "The window has to end after it starts." };

  if (body.beforeJobId !== undefined) {
    if (body.beforeJobId === null || body.beforeJobId === "") out.beforeJobId = null;
    else if (typeof body.beforeJobId === "string" && body.beforeJobId.length <= 64) {
      const job = await prisma.job.findFirst({ where: { id: body.beforeJobId, companyId: actor.companyId, ...jobScope(actor) }, select: { id: true } });
      if (!job) return { error: "That job doesn't exist." };
      out.beforeJobId = job.id;
    } else return { error: "That job isn't valid." };
  }

  // A float window on a plain block means nothing; a flexible stop whose
  // window or kind changed is unplaced again so the next Optimize re-slots it
  if (kind === "BLOCK") {
    if (out.flexible) out.flexible = false;
    if (out.floatAfterMin != null || out.floatBeforeMin != null) {
      out.floatAfterMin = null;
      out.floatBeforeMin = null;
    }
  } else if (out.floatAfterMin !== undefined || out.floatBeforeMin !== undefined || out.flexible === true) {
    out.placedAt = null;
  }
  return out;
}
