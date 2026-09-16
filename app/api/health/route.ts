import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
  if (req.nextUrl.searchParams.get("cron") !== "1") return NextResponse.json({ ok: true, commit });

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
