/**
 * Who's doing the job, and what it's called — the two answers every
 * job-creating path used to leave to the person typing.
 *
 * Crew: a scheduled job needs somebody on it. Assignments drive tech
 * visibility, the schedule's team filter, booking availability AND calendar
 * sync (a job nobody is assigned to is on nobody's Google Calendar / .ics
 * feed). A one-person company never has to think about it: with exactly one
 * active member, every job lands on them. Bigger teams pick, or mark the job
 * outsourced (a subcontractor is doing it — no crew on purpose).
 *
 * Title: optional everywhere. Blank falls back to the services on the job,
 * then the request it came from, then a generic label — the job number is
 * its real identity anyway.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { titleFromServices } from "@/lib/service-title";

type Db = Prisma.TransactionClient | PrismaClient;

/** Error surfaced when a job would be scheduled with nobody on it. */
export const NEEDS_CREW_ERROR = "Pick who's doing this job, or mark it outsourced.";
export const NEEDS_CREW_CODE = "NEEDS_CREW";

export const DEFAULT_JOB_TITLE = "Service visit";

/** The one active member of a one-person company, else null. */
export async function soloMemberId(db: Db, companyId: string): Promise<string | null> {
  const users = await db.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
    take: 2,
  });
  return users.length === 1 ? users[0].id : null;
}

/**
 * Turn whatever a client sent as `assigneeIds` into real crew: unknown /
 * inactive / other-company ids are dropped, and an empty result in a
 * one-person company becomes that one person (unless the job is outsourced,
 * where "nobody" is the point).
 */
export async function resolveCrew(
  db: Db,
  companyId: string,
  requested: unknown,
  opts: { outsourced?: boolean } = {}
): Promise<string[]> {
  const ids = Array.isArray(requested)
    ? Array.from(new Set(requested.filter((v): v is string => typeof v === "string" && v.length > 0)))
    : [];
  const valid =
    ids.length > 0
      ? (
          await db.user.findMany({
            where: { id: { in: ids }, companyId, isActive: true },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [];
  if (valid.length > 0 || opts.outsourced) return valid;
  const solo = await soloMemberId(db, companyId);
  return solo ? [solo] : [];
}

/** True when a scheduled job in this state has nobody to do it. */
export function crewMissing(input: { scheduledAt: Date | null; crew: string[]; outsourced: boolean }): boolean {
  return Boolean(input.scheduledAt) && input.crew.length === 0 && !input.outsourced;
}

/** Sanitize the optional "who it's outsourced to" name. */
export function cleanOutsourcedTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, 120);
  return v || null;
}

/**
 * A title for a job: what was typed, else the services on it ("Gutter
 * cleaning", "Mow + Edge", "Mow + 2 more"), else the request's title, else
 * a generic label.
 */
export function deriveJobTitle(input: {
  title?: unknown;
  lineItemNames?: (string | null | undefined)[];
  requestTitle?: string | null;
}): string {
  const typed = typeof input.title === "string" ? input.title.trim().slice(0, 150) : "";
  if (typed) return typed;
  const fromServices = titleFromServices(input.lineItemNames ?? []);
  if (fromServices) return fromServices.slice(0, 150);
  const fromRequest = (input.requestTitle ?? "").trim();
  if (fromRequest) return fromRequest.slice(0, 150);
  return DEFAULT_JOB_TITLE;
}
