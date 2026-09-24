import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Actor } from "./permissions";
import { buildEstimator, type BuildAnswer, type BuildEvent, type BuildImage } from "./estimator-build";

/**
 * Estimate-tool builds as server-side jobs (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 10). The builder used to stream over the request that started it,
 * so closing the tab or tapping another page killed the build before it
 * saved. Now `POST /build` creates an EstimatorBuild row and returns at
 * once; the build runs on in `after()` and appends every event to the row;
 * the page polls `GET /build/[id]` and replays the events it hasn't seen.
 * Coming back later (or to another device) picks the same build up.
 *
 * The photo of a price sheet stays in memory for the run — it is never
 * written to the row.
 */

export type BuildStatus = "running" | "questions" | "done" | "error" | "cancelled";

/** Thrown inside the job loop when the owner cancelled the build mid-way. */
class BuildCancelled extends Error {}

/** A "running" row nobody has touched for this long was interrupted (deploy, restart). */
const STALE_MS = 4 * 60 * 1000;
/** Builds waiting on the owner's answers stay resumable this long. */
const QUESTIONS_KEEP_MS = 2 * 60 * 60 * 1000;

export type BuildRow = {
  id: string;
  companyId: string;
  userId: string;
  estimatorId: string | null;
  prompt: string;
  status: BuildStatus;
  events: BuildEvent[];
  toolId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const BUILD_SELECT = { id: true, companyId: true, userId: true, estimatorId: true, prompt: true, status: true, events: true, toolId: true, createdAt: true, updatedAt: true } as const;

function statusAfter(ev: BuildEvent, prev: BuildStatus): BuildStatus {
  if ("done" in ev) return "done";
  if ("error" in ev) return "error";
  if ("questions" in ev || "ask" in ev) return "questions";
  return prev;
}

/** Create the row. The caller schedules `runBuildJob` after the response (next/server `after`). */
export async function createBuildJob(actor: Pick<Actor, "id" | "companyId">, opts: { prompt: string; estimatorId?: string }): Promise<string> {
  const row = await prisma.estimatorBuild.create({
    data: { companyId: actor.companyId, userId: actor.id, estimatorId: opts.estimatorId ?? null, prompt: opts.prompt.slice(0, 4000), status: "running", events: [] },
    select: { id: true },
  });
  return row.id;
}

/** Run the build to the end, whatever the client does — every event lands on the row as it happens. */
export async function runBuildJob(
  id: string,
  actor: Actor,
  opts: { prompt: string; estimatorId?: string; assistantName: string; answers: BuildAnswer[]; image: BuildImage | null }
): Promise<void> {
  const events: BuildEvent[] = [];
  let status: BuildStatus = "running";
  let toolId: string | null = null;
  // A cancelled row is never written over: the update is conditional, and a
  // miss means the owner pressed Cancel — the loop stops and nothing is
  // saved. The builder also asks `cancelled()` before each model call so a
  // cancel between steps skips the next (expensive) call outright.
  const flush = async () => {
    const r = await prisma.estimatorBuild
      .updateMany({ where: { id, status: { not: "cancelled" } }, data: { events: events as unknown as Prisma.InputJsonValue, status, ...(toolId ? { toolId } : {}) } })
      .catch((err) => {
        console.error("[estimator-build-jobs] flush failed", { id, error: err });
        return { count: 1 };
      });
    if (r.count === 0) throw new BuildCancelled();
  };
  const cancelled = async () => {
    const row = await prisma.estimatorBuild.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
    return row?.status === "cancelled";
  };
  try {
    for await (const ev of buildEstimator(actor, { ...opts, cancelled })) {
      events.push(ev);
      status = statusAfter(ev, status);
      if ("done" in ev && typeof ev.tool.id === "string") toolId = ev.tool.id;
      await flush();
    }
    if (status === "running") {
      events.push({ error: "The build stopped without a result — please try again.", tokens: 0 });
      status = "error";
      await flush();
    }
  } catch (err) {
    if (err instanceof BuildCancelled) return;
    console.error("[estimator-build-jobs] build crashed", { id, error: err });
    events.push({ error: "Something went wrong while building — please try again.", tokens: 0 });
    status = "error";
    await flush().catch(() => undefined);
  }
}

/**
 * The owner changed their mind: mark the row cancelled and drop what it had
 * produced so far (the plan, the draft — nothing was ever saved as a tool).
 * The job aborts its model call in flight and does no further work; the
 * calls that already completed stay on the meter. False = not found or
 * already finished.
 */
export async function cancelBuild(id: string, companyId: string): Promise<boolean> {
  const r = await prisma.estimatorBuild.updateMany({ where: { id, companyId, status: { in: ["running", "questions"] } }, data: { status: "cancelled", events: [], toolId: null } });
  return r.count > 0;
}

function shape(row: { id: string; companyId: string; userId: string; estimatorId: string | null; prompt: string; status: string; events: unknown; toolId: string | null; createdAt: Date; updatedAt: Date }): BuildRow {
  let status = row.status as BuildStatus;
  const events = (Array.isArray(row.events) ? row.events : []) as BuildEvent[];
  if (status === "running" && Date.now() - row.updatedAt.getTime() > STALE_MS) {
    status = "error";
    events.push({ error: "The build was interrupted — please try again.", tokens: 0 });
  }
  return { ...row, status, events };
}

/** One build, scoped to the company. */
export async function loadBuild(id: string, companyId: string): Promise<BuildRow | null> {
  const row = await prisma.estimatorBuild.findFirst({ where: { id, companyId }, select: BUILD_SELECT });
  return row ? shape(row) : null;
}

/**
 * Builds the page should pick back up: still running (fresh), or waiting on
 * the owner's answers. `estimatorId` narrows to one tool's changes; null
 * means new-tool builds only.
 */
export async function resumableBuilds(companyId: string, estimatorId: string | null): Promise<BuildRow[]> {
  const now = Date.now();
  const rows = await prisma.estimatorBuild.findMany({
    where: {
      companyId,
      estimatorId,
      OR: [
        { status: "running", updatedAt: { gte: new Date(now - STALE_MS) } },
        { status: "questions", updatedAt: { gte: new Date(now - QUESTIONS_KEEP_MS) } },
      ],
    },
    select: BUILD_SELECT,
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  return rows.map(shape).filter((r) => r.status === "running" || r.status === "questions");
}

/** The newest build the page should resume, or null. */
export async function resumableBuildId(companyId: string, estimatorId: string | null): Promise<string | null> {
  const rows = await resumableBuilds(companyId, estimatorId);
  return rows[0]?.id ?? null;
}

/** Housekeeping: rows older than a week are noise (the tool itself is the record). */
export async function pruneBuilds(): Promise<number> {
  const r = await prisma.estimatorBuild.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
  return r.count;
}
