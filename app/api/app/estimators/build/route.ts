import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { readAssistImage } from "@/lib/estimator-assist";
import { createBuildJob, resumableBuilds, runBuildJob } from "@/lib/estimator-build-jobs";

export const dynamic = "force-dynamic";

/**
 * POST { prompt, estimatorId?, answers?, imageBase64?, imageMime? } — start
 * building a new estimate tool (or a change to one) from plain words,
 * optionally with a PHOTO of the owner's price sheet. Answers 202 with the
 * build id at once; the build itself runs on after the response
 * (lib/estimator-build-jobs.ts) so leaving the page never loses it. The
 * page polls GET /api/app/estimators/build/[id] for the events
 * (lib/estimator-build.ts): {phase, message}…, then {done, tool} |
 * {questions} | {ask} | {error}. Managers only; metered like any Atlas call.
 *
 * GET ?estimatorId= — the builds worth picking back up (running, or waiting
 * on answers) for the company's new-tool builder, or for one tool's changes.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & { prompt?: unknown; estimatorId?: unknown; answers?: unknown };
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const image = readAssistImage(body);
  if (image === "bad") return NextResponse.json({ error: "That picture couldn't be read — use a JPEG, PNG or WebP under 2 MB." }, { status: 400 });
  if (prompt.trim().length < 8 && !image) return NextResponse.json({ error: "Describe the tool in a sentence or two first." }, { status: 400 });
  const estimatorId = typeof body.estimatorId === "string" && body.estimatorId ? body.estimatorId.slice(0, 40) : undefined;
  // one round of clarifying answers (BuildPanel re-posts with them)
  const answers = Array.isArray(body.answers)
    ? body.answers.slice(0, 6).map((a) => {
        const o = (a ?? {}) as Record<string, unknown>;
        return { question: typeof o.question === "string" ? o.question : "", answer: typeof o.answer === "string" ? o.answer : "" };
      })
    : [];
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { assistantName: true } });
  const assistantName = company?.assistantName || "Atlas";

  const buildId = await createBuildJob(actor, { prompt, estimatorId });
  after(() => runBuildJob(buildId, actor, { prompt, estimatorId, assistantName, answers, image }));
  return NextResponse.json({ buildId }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const estimatorId = (req.nextUrl.searchParams.get("estimatorId") ?? "").slice(0, 40) || null;
  const rows = await resumableBuilds(actor.companyId, estimatorId);
  return NextResponse.json({ builds: rows.map((r) => ({ id: r.id, prompt: r.prompt, estimatorId: r.estimatorId, status: r.status, updatedAt: r.updatedAt.toISOString() })) });
}
