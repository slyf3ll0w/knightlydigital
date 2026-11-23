import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planGatingLive } from "@/lib/plans";
import { cameThroughEdge } from "@/lib/rate-limit";

// Railway's deploy healthcheck (and any uptime monitor) hits this. It must
// prove the app can actually serve tenants — process up AND database
// reachable — so a deploy whose `prisma db push` left the DB broken, or a
// container that lost its connection, never replaces a working deployment.
//
// `?cron=1` adds a dead-man check for the hourly billing cron: the nightly
// reconciliation (last step of POST /api/cron/recurring, self-gated to once
// a day) leaves a ReconcileRun row, so a run older than CRON_STALE_HOURS
// means the cron stopped firing — the one failure the cron itself can never
// report. Point an external uptime monitor at /api/health?cron=1; Railway's
// deploy healthcheck keeps hitting the bare path, which never looks at this.
export const dynamic = "force-dynamic";

const CRON_STALE_HOURS = 30;

export async function GET(req: NextRequest) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }

  // `commit` lets CI wait for a specific build to be live before running the
  // e2e suite against it (Railway injects RAILWAY_GIT_COMMIT_SHA).
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  // `processor` lets the e2e harness gate the specs that move sandbox money
  // on what is DEPLOYED (Finix card specs skip while staging runs Square).
  // Mirrors lib/payments.ts DEFAULT_PROCESSOR: unset = square (2026-10-22).
  const processor = process.env.PAYMENT_PROCESSOR ?? "square";
  // `planGating` lets the e2e plan-gate spec know whether the Pro feature
  // gates (lib/plans.ts, PLAN_GATING=1) are live on this deployment.
  const planGating = planGatingLive();
  // `edge` says whether THIS request carried Cloudflare's shared header
  // (EDGE_SHARED_SECRET, lib/rate-limit.ts cameThroughEdge), so the rule in
  // Cloudflare and the variable here can be checked against each other
  // without either value being shown: "on" = they match, "missing" = the
  // variable is set but the request came without the right header (Railway's
  // own healthcheck always reads "missing": it does not pass through
  // Cloudflare), "off" = never believed (staging), "unset" = not configured.
  const secret = process.env.EDGE_SHARED_SECRET?.trim();
  const edge = !secret ? "unset" : secret.toLowerCase() === "off" ? "off" : cameThroughEdge(req.headers) ? "on" : "missing";
  if (req.nextUrl.searchParams.get("cron") !== "1") return NextResponse.json({ ok: true, commit, processor, planGating, edge });

  const latest = await prisma.reconcileRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  const ageHours = latest ? (Date.now() - latest.startedAt.getTime()) / 3600_000 : null;
  const stale = ageHours === null || ageHours > CRON_STALE_HOURS;
  return NextResponse.json(
    {
      ok: !stale,
      cron: {
        lastReconcileAt: latest?.startedAt ?? null,
        ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
        ...(stale ? { error: latest ? "cron has not run in over 30 hours" : "cron has never run" } : {}),
      },
    },
    { status: stale ? 503 : 200 }
  );
}
