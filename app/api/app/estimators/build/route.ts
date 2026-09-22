import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { buildEstimator } from "@/lib/estimator-build";

export const dynamic = "force-dynamic";

/**
 * POST { prompt, estimatorId? } — build a new estimate tool (or change an
 * existing one) from plain words. Streams newline-delimited JSON events the
 * Estimates page animates (lib/estimator-build.ts): {phase, message}…, then
 * {done, tool} | {ask} | {error}. Managers only; metered like any Atlas call.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; estimatorId?: unknown; answers?: unknown };
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of buildEstimator(actor, { prompt, estimatorId, assistantName, answers })) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (err) {
        console.error("[estimators/build] failed", err);
        controller.enqueue(encoder.encode(JSON.stringify({ error: "Something went wrong while building — please try again.", tokens: 0 }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
